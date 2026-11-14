import os
import re
import threading
import time
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import yfinance as yf
try:
    from nselib import capital_market
except Exception:          # nselib missing or NSE unreachable: fall back to a built-in list
    capital_market = None

from sklearn.base import clone
from sklearn.ensemble import (
    RandomForestRegressor,
    GradientBoostingRegressor,
    ExtraTreesRegressor,
    AdaBoostRegressor,
)
from sklearn.linear_model import Ridge, Lasso, ElasticNet
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.neighbors import KNeighborsRegressor
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.svm import SVR

try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False
try:
    from lightgbm import LGBMRegressor
    LIGHTGBM_AVAILABLE = True
except ImportError:
    LIGHTGBM_AVAILABLE = False
try:
    from catboost import CatBoostRegressor
    CATBOOST_AVAILABLE = True
except ImportError:
    CATBOOST_AVAILABLE = False

from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.holtwinters import ExponentialSmoothing, Holt

import importlib.util


def _has(module):
    try:
        return importlib.util.find_spec(module) is not None
    except Exception:
        return False


# Heavy optional libraries are detected here but only imported when a run starts,
# so the helper starts quickly and the ticker list loads instantly.
PROPHET_AVAILABLE = _has("prophet")
GARCH_AVAILABLE = _has("arch")
DL_AVAILABLE = _has("tensorflow")


def _load_optional(deep_learning):
    global PROPHET_AVAILABLE, GARCH_AVAILABLE, DL_AVAILABLE
    global Prophet, arch_model, tf, EarlyStopping, Dense, Dropout, LSTM, GRU, Conv1D, Flatten, Input, Sequential, l2
    if PROPHET_AVAILABLE and "Prophet" not in globals():
        try:
            from prophet import Prophet
        except Exception as exc:
            print(f"Prophet unavailable: {exc}")
            PROPHET_AVAILABLE = False
    if GARCH_AVAILABLE and "arch_model" not in globals():
        try:
            from arch import arch_model
        except Exception as exc:
            print(f"arch unavailable: {exc}")
            GARCH_AVAILABLE = False
    if deep_learning and DL_AVAILABLE and "tf" not in globals():
        try:
            import tensorflow as tf
            from tensorflow.keras.callbacks import EarlyStopping
            from tensorflow.keras.layers import Dense, Dropout, LSTM, GRU, Conv1D, Flatten, Input
            from tensorflow.keras.models import Sequential
            from tensorflow.keras.regularizers import l2
        except Exception as exc:
            print(f"TensorFlow unavailable: {exc}")
            DL_AVAILABLE = False


warnings.filterwarnings("ignore")


def _drop_none(models):
    return {name: model for name, model in models.items() if model is not None}


def _missing(*args, **kwargs):
    return None


if not XGBOOST_AVAILABLE:
    XGBRegressor = _missing
if not LIGHTGBM_AVAILABLE:
    LGBMRegressor = _missing
if not CATBOOST_AVAILABLE:
    CatBoostRegressor = _missing


# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------
RANDOM_STATE = 42
TEST_FRACTION = 0.20
VALIDATION_FRACTION = 0.20
TRAINING_LOOKBACK_YEARS = 35

# The point forecast starts after the historical data cutoff. The window is now set
# at the start of every run (see configure_forecast_window): history runs up to
# yesterday and the forecast covers today onwards for the chosen number of months.
FUTURE_FORECAST_START = pd.Timestamp.today().normalize()
FUTURE_FORECAST_END = FUTURE_FORECAST_START + pd.DateOffset(months=6)

# Feature/sequence settings.
MAX_FEATURE_LOOKBACK = 50
DL_LOOKBACK = 30
WARM_BUFFER_SIZE = max(MAX_FEATURE_LOOKBACK + 2, DL_LOOKBACK + 2)

# Selection gates are applied ONLY to the validation set.
MIN_DIRECTIONAL_ACCURACY = 52.0
MIN_SHARPE = 0.50
MAX_DRAWDOWN = 30.0
MIN_TRADE_EVENTS = 30
CONFIDENCE_TRADE_EVENTS = 50

# Backtest assumptions. 5 bps = 0.05% of notional per unit of turnover.
TRANSACTION_COST_BPS = 5.0

# Runtime controls.
N_JOBS = max(1, (os.cpu_count() or 2) - 1)
ENABLE_DEEP_LEARNING = True
DL_EPOCHS = 15
DL_BATCH_SIZE = 64
DL_PATIENCE = 3
CV_SPLITS = 3

MODEL_DESCRIPTIONS = {
    "Deep Learning Models": {
        "1D CNN": "CNN over a 30-session feature sequence; dropout and L2 regularization are used to reduce overfitting.",
        "GRU": "Gated recurrent network using a 30-session sequence to model temporal dependencies efficiently.",
        "LSTM": "Long Short-Term Memory network using a 30-session sequence with dropout, L2 regularization and early stopping.",
        "MLP / ANN": "Feed-forward neural network using the latest engineered feature vector with dropout and weight decay.",
    },
    "Machine Learning Models": {
        "AdaBoost": "Adaptive boosting regressor using shallow decision trees.",
        "CatBoost": "Gradient boosting model with ordered boosting and conservative tree depth.",
        "Elastic Net": "Linear regression combining L1 and L2 regularization.",
        "Extra Trees": "Extremely randomized tree ensemble.",
        "Gradient Boosting": "Sequential gradient-boosted decision trees.",
        "KNN Regression": "Nearest-neighbour regression using standardized feature space.",
        "Lasso Regression": "L1-regularized linear regression.",
        "LightGBM": "Fast gradient-boosted decision-tree model.",
        "Random Forest": "Bagged decision-tree ensemble.",
        "Ridge Regression": "L2-regularized linear regression across price-action, trend, momentum, volatility, volume and calendar features.",
        "SVR": "Kernel support-vector regression.",
        "XGBoost": "Gradient-boosted decision-tree ensemble with conservative fixed hyperparameters to control runtime.",
    },
    "Traditional Time-Series Models": {
        "ARIMA": "Autoregressive integrated moving-average model for the price series.",
        "Exponential Smoothing": "Holt level/trend model without seasonality.",
        "GARCH": "GARCH model for return dynamics and conditional volatility; the mean return forecast is converted back to price.",
        "Holt-Winters / ETS": "Exponential smoothing model with level and trend components.",
        "Prophet": "Additive time-series model evaluated on the exact historical and future dates used by the application.",
        "SARIMA": "Seasonal ARIMA model with a short weekly trading-cycle seasonality.",
    },
}

# A single shared status object preserves the existing frontend contract.
job_lock = threading.Lock()
job_status = {
    "progress": 0,
    "message": "Idle",
    "completed": False,
    "result": None,
    "error": None,
}


def set_job_status(**updates):
    global job_status
    with job_lock:
        job_status = {**job_status, **updates}


def load_live_nse_tickers():
    fallback_symbols = [
        "RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK", "ITC", "SBIN",
        "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK", "HINDUNILVR", "MARUTI",
        "SUNPHARMA", "TITAN", "BAJFINANCE", "ASIANPAINT", "HCLTECH", "WIPRO",
        "ULTRACEMCO", "M&M", "NTPC", "POWERGRID", "ONGC", "TATASTEEL",
        "JSWSTEEL", "ADANIENT", "ADANIPORTS", "COALINDIA", "TECHM",
    ]
    try:
        if capital_market is None:
            raise RuntimeError("nselib is not installed")
        df_symbols = capital_market.equity_list()
        symbols = df_symbols["SYMBOL"].dropna().astype(str).unique().tolist()
        if symbols:
            return sorted(f"{sym}.NS" for sym in symbols)
    except Exception as exc:
        print(f"NSE ticker list unavailable; using fallback list: {exc}")
    return sorted(f"{symbol}.NS" for symbol in fallback_symbols)


_TICKER_CACHE = {"list": None, "source": None}


def get_tickers():
    """All NSE symbols (live from NSE through nselib; built-in short list if NSE cannot be reached)."""
    if _TICKER_CACHE["list"] is None:
        live = capital_market is not None
        tickers = load_live_nse_tickers()
        _TICKER_CACHE["list"] = tickers
        _TICKER_CACHE["source"] = "nse" if (live and len(tickers) > 60) else "fallback"
    return _TICKER_CACHE["list"], _TICKER_CACHE["source"]


# -----------------------------------------------------------------------------
# Metrics and model-selection logic
# -----------------------------------------------------------------------------
def _safe_float(value, default=0.0):
    try:
        value = float(value)
        return value if np.isfinite(value) else default
    except Exception:
        return default


def calculate_strategy_metrics(y_true, y_pred, y_prev):
    """Calculate forecast and economic metrics without using future information.

    A prediction for day t is converted to a long/short/flat position relative to
    the previous close. The realized return is the t close-to-close move. Costs
    are charged on changes in position (turnover), rather than counting every
    observation as a separate trade.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    y_prev = np.asarray(y_prev, dtype=float)

    valid = np.isfinite(y_true) & np.isfinite(y_pred) & np.isfinite(y_prev) & (np.abs(y_prev) > 1e-12)
    y_true, y_pred, y_prev = y_true[valid], y_pred[valid], y_prev[valid]
    if len(y_true) == 0:
        raise ValueError("No valid observations available for metric calculation.")

    rmse = float(np.sqrt(mean_squared_error(y_true, y_pred)))
    mae = float(mean_absolute_error(y_true, y_pred))
    r2 = float(r2_score(y_true, y_pred)) if len(y_true) > 1 else 0.0
    mape = float(np.mean(np.abs((y_true - y_pred) / np.maximum(np.abs(y_true), 1e-8))) * 100)

    actual_direction = np.sign(y_true - y_prev)
    pred_direction = np.sign(y_pred - y_prev)
    nonzero_actual = actual_direction != 0
    dir_acc = (
        float(np.mean(actual_direction[nonzero_actual] == pred_direction[nonzero_actual]) * 100)
        if np.any(nonzero_actual) else 50.0
    )

    position = pred_direction.astype(float)
    asset_return = (y_true - y_prev) / y_prev

    turnover = np.zeros_like(position)
    if len(position):
        turnover[0] = abs(position[0])
    if len(position) > 1:
        turnover[1:] = np.abs(position[1:] - position[:-1])

    transaction_cost = turnover * (TRANSACTION_COST_BPS / 10000.0)
    strategy_returns = position * asset_return - transaction_cost
    strategy_returns = np.nan_to_num(strategy_returns, nan=0.0, posinf=0.0, neginf=0.0)

    equity_curve = np.cumprod(1.0 + strategy_returns)
    cumulative_return = float((equity_curve[-1] - 1.0) * 100.0)
    returns_series = pd.Series(strategy_returns)
    sharpe = float((returns_series.mean() / (returns_series.std(ddof=1) + 1e-12)) * np.sqrt(252)) if len(returns_series) > 1 else 0.0
    running_max = np.maximum.accumulate(equity_curve)
    drawdown = equity_curve / np.maximum(running_max, 1e-12) - 1.0
    max_drawdown = float(abs(drawdown.min()) * 100.0)

    gross_profit = float(strategy_returns[strategy_returns > 0].sum())
    gross_loss = float(abs(strategy_returns[strategy_returns < 0].sum()))
    profit_factor = gross_profit / (gross_loss + 1e-12)
    trade_events = int(np.count_nonzero(turnover > 0))
    signal_days = int(np.count_nonzero(position))

    naive_rmse = float(np.sqrt(mean_squared_error(y_true, y_prev)))
    rmse_improvement = 1.0 - rmse / max(naive_rmse, 1e-12)

    passes_gates = (
        dir_acc > MIN_DIRECTIONAL_ACCURACY
        and sharpe > MIN_SHARPE
        and max_drawdown < MAX_DRAWDOWN
        and trade_events >= MIN_TRADE_EVENTS
    )
    low_confidence = passes_gates and trade_events < CONFIDENCE_TRADE_EVENTS

    # Composite score used for selection. It is deliberately calculated on the
    # validation set, never on the final test set.
    forecast_score = float(np.clip(rmse_improvement * 100.0, 0.0, 100.0))
    direction_score = float(np.clip(dir_acc, 0.0, 100.0))
    return_score = float(np.clip((sharpe / 3.0) * 100.0, 0.0, 100.0))
    risk_score = float(np.clip(100.0 - max_drawdown, 0.0, 100.0))
    selection_score = (
        0.30 * forecast_score
        + 0.25 * direction_score
        + 0.30 * return_score
        + 0.15 * risk_score
    )

    quality_gates = {
        "DirectionalAccuracy": bool(dir_acc > MIN_DIRECTIONAL_ACCURACY),
        "SharpeThreshold": bool(sharpe > MIN_SHARPE),
        "MaxDrawdownThreshold": bool(max_drawdown < MAX_DRAWDOWN),
        "MinimumTradeEvents": bool(trade_events >= MIN_TRADE_EVENTS),
    }

    return {
        "RMSE": round(rmse, 2),
        "NaiveRMSE": round(naive_rmse, 2),
        "RMSEImprovementPct": round(rmse_improvement * 100.0, 2),
        "MAE": round(mae, 2),
        "R2": round(r2, 4),
        "MAPE": round(mape, 2),
        "DirAcc": round(dir_acc, 2),
        "BacktestReturn": round(cumulative_return, 2),
        "TradingScore": round(selection_score, 2),
        "SelectionScore": round(selection_score, 2),
        "Sharpe": round(sharpe, 2),
        "MaxDrawdown": round(max_drawdown, 2),
        "ProfitFactor": round(profit_factor, 2),
        "TradeCount": trade_events,
        "TradeEvents": trade_events,
        "SignalDays": signal_days,
        "TransactionCostBps": TRANSACTION_COST_BPS,
        "QualityGates": quality_gates,
        "PassesGates": bool(passes_gates),
        "PassesQualityGates": bool(passes_gates),
        "LowConfidence": bool(low_confidence),
    }


def calculate_selection_score(validation_metrics):
    """Return the already-computed validation score; kept separate for clarity."""
    return _safe_float(validation_metrics.get("SelectionScore", validation_metrics.get("TradingScore", 0.0)))


def build_comparison(y_true, y_pred, dates):
    records = []
    errors = []
    pct_errors = []
    for actual, pred, date_val in zip(y_true, y_pred, dates):
        actual = float(actual)
        pred = float(pred)
        error = pred - actual
        pct_error = error / max(abs(actual), 1e-8) * 100.0
        errors.append(error)
        pct_errors.append(pct_error)
        records.append({
            "Date": pd.Timestamp(date_val).strftime("%Y-%m-%d"),
            "Actual": round(actual, 2),
            "Forecast": round(pred, 2),
            "AbsError": round(error, 2),
            "PctError": round(pct_error, 2),
        })
    return records, {
        "mean_error": round(float(np.mean(errors)), 2),
        "std_error": round(float(np.std(errors)), 2),
        "mean_pct_error": round(float(np.mean(pct_errors)), 2),
        "std_pct_error": round(float(np.std(pct_errors)), 2),
    }


def attach_test_metrics(validation_metrics, test_metrics):
    """Keep the original UI-friendly fields while clearly separating selection from test results."""
    result = dict(test_metrics)
    result["ValidationSelectionScore"] = validation_metrics.get("SelectionScore")
    result["ValidationPassesGates"] = validation_metrics.get("PassesGates")
    result["ValidationDirAcc"] = validation_metrics.get("DirAcc")
    result["ValidationSharpe"] = validation_metrics.get("Sharpe")
    result["ValidationMaxDrawdown"] = validation_metrics.get("MaxDrawdown")
    result["ValidationTradeEvents"] = validation_metrics.get("TradeEvents")
    return result


# -----------------------------------------------------------------------------
# Feature engineering
# -----------------------------------------------------------------------------
FEATURE_COLS = [
    "Close", "Open", "High", "Low", "daily_return", "log_return", "ret_5d",
    "ret_10d", "ret_20d", "sma_5", "sma_10", "sma_20", "sma_50", "ema_12",
    "ema_26", "price_to_sma20", "price_to_sma50", "rsi_14", "macd",
    "macd_signal", "macd_hist", "stoch_k", "stoch_d", "williams_r", "bb_pct",
    "bb_width", "atr_14", "volatility_20", "volume_ratio", "obv", "day_sin",
    "day_cos", "month_sin", "month_cos",
]
CALENDAR_FEATURES = {"day_sin", "day_cos", "month_sin", "month_cos"}
PRICE_FEATURE_COLS = [c for c in FEATURE_COLS if c not in CALENDAR_FEATURES]


def engineer_features(source, shift_features=True):
    engineered = source.copy()
    close = engineered["Close"].astype(float)
    high = engineered["High"].astype(float)
    low = engineered["Low"].astype(float)
    volume = engineered["Volume"].astype(float)
    target_close = close.copy()
    returns = close.pct_change()

    sma_5 = close.rolling(5).mean()
    sma_10 = close.rolling(10).mean()
    sma_20 = close.rolling(20).mean()
    sma_50 = close.rolling(50).mean()
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()

    delta = close.diff()
    gains = delta.clip(lower=0)
    losses = -delta.clip(upper=0)
    avg_gain = gains.rolling(14).mean()
    avg_loss = losses.rolling(14).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi_14 = 100 - 100 / (1 + rs)
    rsi_14 = rsi_14.mask((avg_loss == 0) & (avg_gain > 0), 100)
    rsi_14 = rsi_14.mask((avg_loss == 0) & (avg_gain == 0), 50)

    macd = ema_12 - ema_26
    macd_signal = macd.ewm(span=9, adjust=False).mean()

    true_range = pd.concat(
        [
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs(),
        ],
        axis=1,
    ).max(axis=1)
    rolling_low = low.rolling(14).min()
    rolling_high = high.rolling(14).max()
    osc_range = (rolling_high - rolling_low).replace(0, np.nan)
    stoch_k = (100 * (close - rolling_low) / osc_range).fillna(50)

    bb_mid = close.rolling(20).mean()
    bb_std = close.rolling(20).std()
    bb_upper = bb_mid + 2 * bb_std
    bb_lower = bb_mid - 2 * bb_std

    obv = (np.sign(delta).fillna(0) * volume).cumsum()
    volume_average = volume.rolling(20).mean()

    engineered["daily_return"] = returns
    engineered["log_return"] = np.log(close / close.shift(1))
    engineered["ret_5d"] = close.pct_change(5)
    engineered["ret_10d"] = close.pct_change(10)
    engineered["ret_20d"] = close.pct_change(20)
    engineered["sma_5"] = sma_5
    engineered["sma_10"] = sma_10
    engineered["sma_20"] = sma_20
    engineered["sma_50"] = sma_50
    engineered["ema_12"] = ema_12
    engineered["ema_26"] = ema_26
    engineered["price_to_sma20"] = close / sma_20
    engineered["price_to_sma50"] = close / sma_50
    engineered["rsi_14"] = rsi_14
    engineered["macd"] = macd
    engineered["macd_signal"] = macd_signal
    engineered["macd_hist"] = macd - macd_signal
    engineered["stoch_k"] = stoch_k
    engineered["stoch_d"] = stoch_k.rolling(3).mean()
    engineered["williams_r"] = (-100 * (rolling_high - close) / osc_range).fillna(-50)
    engineered["bb_pct"] = ((close - bb_lower) / (bb_upper - bb_lower).replace(0, np.nan)).fillna(0.5)
    engineered["bb_width"] = ((bb_upper - bb_lower) / bb_mid.replace(0, np.nan)).fillna(0)
    engineered["atr_14"] = true_range.rolling(14).mean()
    engineered["volatility_20"] = returns.rolling(20).std()
    engineered["volume_ratio"] = (volume / volume_average.replace(0, np.nan)).fillna(1)
    engineered["obv"] = obv

    day = engineered.index.dayofweek
    month = engineered.index.month
    engineered["day_sin"] = np.sin(2 * np.pi * day / 5)
    engineered["day_cos"] = np.cos(2 * np.pi * day / 5)
    engineered["month_sin"] = np.sin(2 * np.pi * (month - 1) / 12)
    engineered["month_cos"] = np.cos(2 * np.pi * (month - 1) / 12)

    # All price-derived features are shifted one session so target[t] is predicted
    # using information available by the close of t-1. Calendar variables are known
    # before the session and therefore remain unshifted.
    if shift_features:
        engineered[PRICE_FEATURE_COLS] = engineered[PRICE_FEATURE_COLS].shift(1)

    engineered["Target_Close"] = target_close
    return engineered


def clean_ohlcv(df):
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    required = ["Open", "High", "Low", "Close", "Volume"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        raise ValueError(f"Missing OHLCV columns: {missing}")
    out = df[required].copy()
    out.index = pd.to_datetime(out.index).tz_localize(None) if getattr(out.index, "tz", None) is not None else pd.to_datetime(out.index)
    out = out[~out.index.duplicated(keep="last")].sort_index()
    return out.dropna(subset=required)


def build_future_dates():
    return pd.bdate_range(FUTURE_FORECAST_START, FUTURE_FORECAST_END)


def get_latest_features(history, forecast_date, fallback_medians):
    feature_frame = engineer_features(history, shift_features=False)[FEATURE_COLS]
    feature_frame = feature_frame.replace([np.inf, -np.inf], np.nan)
    feature_frame = feature_frame.ffill().bfill().fillna(fallback_medians).fillna(0.0)
    if feature_frame.empty:
        raise ValueError("Insufficient OHLCV history for recursive feature generation.")
    latest = feature_frame.iloc[-1].copy()
    latest["day_sin"] = np.sin(2 * np.pi * forecast_date.dayofweek / 5)
    latest["day_cos"] = np.cos(2 * np.pi * forecast_date.dayofweek / 5)
    latest["month_sin"] = np.sin(2 * np.pi * (forecast_date.month - 1) / 12)
    latest["month_cos"] = np.cos(2 * np.pi * (forecast_date.month - 1) / 12)
    return latest[FEATURE_COLS].to_numpy(dtype=float).reshape(1, -1)


def append_forecast_row(history, forecast_date, predicted_price, average_volume):
    previous_close = float(history["Close"].iloc[-1])
    predicted_price = _safe_float(predicted_price, previous_close)
    if predicted_price <= 0:
        predicted_price = previous_close

    # Synthetic OHLC is intentionally conservative. It is only used to create
    # recursive indicators after a forecast; it is not mixed into the historical test set.
    row = pd.DataFrame(
        {
            "Open": [previous_close],
            "High": [max(previous_close, predicted_price)],
            "Low": [min(previous_close, predicted_price)],
            "Close": [predicted_price],
            "Volume": [average_volume],
        },
        index=pd.DatetimeIndex([pd.Timestamp(forecast_date)]),
    )
    history = pd.concat([history, row])
    history = history[~history.index.duplicated(keep="last")].sort_index()
    return history.tail(WARM_BUFFER_SIZE), predicted_price


def extract_feature_importance(model, feature_scales):
    estimator = model
    if hasattr(model, "named_steps"):
        estimator = model.named_steps.get("model", model)
    if hasattr(estimator, "feature_importances_"):
        raw = np.asarray(estimator.feature_importances_, dtype=float)
    elif hasattr(estimator, "coef_"):
        coefficients = np.asarray(estimator.coef_, dtype=float).reshape(-1)
        raw = np.abs(coefficients * np.asarray(feature_scales, dtype=float))
    else:
        return []
    if raw.size != len(FEATURE_COLS) or not np.isfinite(raw).all() or raw.sum() <= 0:
        return []
    normalized = raw / raw.sum() * 100.0
    ranked = sorted(zip(FEATURE_COLS, normalized), key=lambda x: x[1], reverse=True)
    return [{"Feature": name, "Importance": round(float(value), 2)} for name, value in ranked[:8]]


# -----------------------------------------------------------------------------
# Machine-learning models
# -----------------------------------------------------------------------------
def build_ml_models():
    return _drop_none({
        "XGBoost": XGBRegressor(
            random_state=RANDOM_STATE,
            objective="reg:squarederror",
            n_estimators=250,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=2.0,
            n_jobs=N_JOBS,
        ),
        "Random Forest": RandomForestRegressor(
            random_state=RANDOM_STATE,
            n_estimators=250,
            max_depth=8,
            min_samples_leaf=3,
            max_features="sqrt",
            n_jobs=N_JOBS,
        ),
        "Gradient Boosting": GradientBoostingRegressor(
            random_state=RANDOM_STATE,
            n_estimators=200,
            max_depth=3,
            learning_rate=0.05,
            subsample=0.8,
        ),
        "Ridge Regression": Pipeline([("scale", StandardScaler()), ("model", Ridge(alpha=10.0))]),
        "Lasso Regression": Pipeline([("scale", StandardScaler()), ("model", Lasso(alpha=0.01, max_iter=10000))]),
        "Elastic Net": Pipeline([("scale", StandardScaler()), ("model", ElasticNet(alpha=0.01, l1_ratio=0.5, max_iter=10000))]),
        "SVR": Pipeline([("scale", StandardScaler()), ("model", SVR(kernel="rbf", C=10.0, epsilon=0.01, gamma="scale"))]),
        "KNN Regression": Pipeline([("scale", StandardScaler()), ("model", KNeighborsRegressor(n_neighbors=10, weights="distance", p=2, n_jobs=N_JOBS))]),
        "LightGBM": LGBMRegressor(
            random_state=RANDOM_STATE,
            n_estimators=250,
            learning_rate=0.05,
            num_leaves=31,
            max_depth=-1,
            subsample=0.8,
            colsample_bytree=0.8,
            reg_lambda=2.0,
            verbosity=-1,
            n_jobs=N_JOBS,
        ),
        "CatBoost": CatBoostRegressor(
            random_state=RANDOM_STATE,
            iterations=250,
            depth=6,
            learning_rate=0.05,
            loss_function="RMSE",
            verbose=False,
            thread_count=N_JOBS,
        ),
        "Extra Trees": ExtraTreesRegressor(
            random_state=RANDOM_STATE,
            n_estimators=250,
            max_depth=10,
            min_samples_leaf=2,
            max_features=0.8,
            n_jobs=N_JOBS,
        ),
        "AdaBoost": AdaBoostRegressor(
            random_state=RANDOM_STATE,
            n_estimators=150,
            learning_rate=0.03,
            loss="square",
        ),
    })


def walk_forward_rmse(model, features, targets, n_splits=CV_SPLITS):
    if len(features) < (n_splits + 1) * 20:
        return np.nan
    scores = []
    for train_idx, valid_idx in TimeSeriesSplit(n_splits=n_splits).split(features):
        fold_model = clone(model)
        fold_model.fit(features.iloc[train_idx], targets.iloc[train_idx])
        pred = fold_model.predict(features.iloc[valid_idx])
        scores.append(np.sqrt(mean_squared_error(targets.iloc[valid_idx], pred)))
    return float(np.mean(scores)) if scores else np.nan


def run_ml_models(X_fit, y_fit, X_valid, y_valid, X_train, y_train, X_test, y_test, y_prev_valid, y_prev_test, future_dates, warm_buffer, average_volume):
    metrics_summary = {}
    model_results = {}
    fitted_models = {}
    fallback_medians = X_train.median().fillna(0.0)
    feature_scales = X_train.std(axis=0, ddof=0).replace(0, 1.0).fillna(1.0)

    models = build_ml_models()
    total = len(models)

    for counter, (name, base_model) in enumerate(models.items(), start=1):
        set_job_status(progress=35 + int(counter / total * 20), message=f"Training ML model {counter}/{total}: {name}...")
        try:
            t0 = time.perf_counter()
            model = clone(base_model)
            model.fit(X_fit, y_fit)

            # Walk-forward CV is performed inside the training partition only.
            wf_rmse = walk_forward_rmse(model, X_fit, y_fit)

            valid_pred = model.predict(X_valid)
            valid_metrics = calculate_strategy_metrics(y_valid.values, valid_pred, y_prev_valid)

            # Refit after validation; test is untouched until this point.
            model.fit(X_train, y_train)
            test_pred = model.predict(X_test)
            elapsed = round((time.perf_counter() - t0) * 1000, 2)

            test_metrics = calculate_strategy_metrics(y_test.values, test_pred, y_prev_test)
            merged_metrics = attach_test_metrics(valid_metrics, test_metrics)
            merged_metrics.update({
                "Type": "Machine Learning Models",
                "ExecutionTimeMs": elapsed,
                "ValidationRMSE": round(float(valid_metrics["RMSE"]), 2),
                "WalkForwardRMSE": round(float(wf_rmse), 2) if np.isfinite(wf_rmse) else None,
                "FeatureImportance": extract_feature_importance(model, feature_scales),
            })
            metrics_summary[name] = merged_metrics
            fitted_models[name] = model

            comparison, error_stats = build_comparison(y_test.values, test_pred, y_test.index)

            history = warm_buffer.copy()
            future_preds = []
            for f_date in future_dates:
                features = get_latest_features(history, f_date, fallback_medians)
                pred_price = float(model.predict(features)[0])
                future_preds.append({"Date": f_date.strftime("%Y-%m-%d"), "Price": round(_safe_float(pred_price), 2)})
                history, _ = append_forecast_row(history, f_date, pred_price, average_volume)

            model_results[name] = {
                "metrics": merged_metrics,
                "comparison": comparison,
                "error_stats": error_stats,
                "future": future_preds,
            }
        except Exception as exc:
            print(f"ML model {name} failed: {exc}")

    return metrics_summary, model_results, fitted_models


# -----------------------------------------------------------------------------
# Deep learning
# -----------------------------------------------------------------------------
def build_dl_model(name, input_shape):
    if name == "MLP / ANN":
        model = Sequential([
            Input(shape=input_shape),
            Dense(64, activation="relu", kernel_regularizer=l2(0.001)),
            Dropout(0.25),
            Dense(32, activation="relu", kernel_regularizer=l2(0.001)),
            Dropout(0.20),
            Dense(1),
        ])
    elif name == "1D CNN":
        model = Sequential([
            Input(shape=input_shape),
            Conv1D(32, kernel_size=3, padding="causal", activation="relu", kernel_regularizer=l2(0.001)),
            Dropout(0.20),
            Conv1D(16, kernel_size=3, padding="causal", activation="relu"),
            Flatten(),
            Dense(16, activation="relu"),
            Dropout(0.20),
            Dense(1),
        ])
    elif name == "LSTM":
        model = Sequential([
            Input(shape=input_shape),
            LSTM(48, return_sequences=True, kernel_regularizer=l2(0.001)),
            Dropout(0.25),
            LSTM(24, kernel_regularizer=l2(0.001)),
            Dropout(0.20),
            Dense(16, activation="relu"),
            Dense(1),
        ])
    elif name == "GRU":
        model = Sequential([
            Input(shape=input_shape),
            GRU(40, return_sequences=True, kernel_regularizer=l2(0.001)),
            Dropout(0.25),
            GRU(20, kernel_regularizer=l2(0.001)),
            Dropout(0.20),
            Dense(16, activation="relu"),
            Dense(1),
        ])
    else:
        raise ValueError(name)
    model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=1e-3), loss="mse")
    return model


def make_sequences(X_scaled, y_scaled, end_indices, lookback):
    X_seq, y_seq = [], []
    for idx in end_indices:
        if idx < lookback - 1:
            continue
        X_seq.append(X_scaled[idx - lookback + 1: idx + 1])
        y_seq.append(y_scaled[idx])
    return np.asarray(X_seq), np.asarray(y_seq)


def run_deep_learning(X_all, y_all, split_fit_end, split_valid_end, X_train, y_train, y_valid, y_test, y_prev_valid, y_prev_test, test_indices, future_dates, warm_buffer, average_volume):
    if not DL_AVAILABLE or not ENABLE_DEEP_LEARNING:
        return {}, {}, {}

    metrics_summary = {}
    model_results = {}
    fitted_models = {}

    try:
        tf.keras.backend.clear_session()
        np.random.seed(RANDOM_STATE)
        tf.random.set_seed(RANDOM_STATE)

        scaler_X = MinMaxScaler()
        scaler_y = MinMaxScaler()
        X_scaled = scaler_X.fit(X_all.iloc[:split_fit_end]).transform(X_all)
        y_scaled = scaler_y.fit(y_all.iloc[:split_fit_end].to_numpy().reshape(-1, 1)).transform(y_all.to_numpy().reshape(-1, 1)).reshape(-1)

        train_indices = np.arange(0, split_fit_end)
        valid_indices = np.arange(split_fit_end, split_valid_end)
        test_indices_arr = np.asarray(test_indices)

        X_train_seq, y_train_seq = make_sequences(X_scaled, y_scaled, train_indices, DL_LOOKBACK)
        X_valid_seq, y_valid_seq = make_sequences(X_scaled, y_scaled, valid_indices, DL_LOOKBACK)
        X_test_seq, y_test_seq = make_sequences(X_scaled, y_scaled, test_indices_arr, DL_LOOKBACK)

        if len(X_train_seq) < 100 or len(X_valid_seq) == 0 or len(X_test_seq) == 0:
            print("Deep learning skipped: insufficient sequence samples.")
            return {}, {}, {}

        sequence_input_shape = (DL_LOOKBACK, X_all.shape[1])
        latest_input_shape = (X_all.shape[1],)
        names = ["MLP / ANN", "1D CNN", "LSTM", "GRU"]

        for offset, name in enumerate(names, start=1):
            set_job_status(progress=55 + offset * 3, message=f"Training deep-learning model {offset}/{len(names)}: {name}...")
            try:
                t0 = time.perf_counter()
                input_shape = latest_input_shape if name == "MLP / ANN" else sequence_input_shape
                model = build_dl_model(name, input_shape)
                callback = EarlyStopping(monitor="val_loss", patience=DL_PATIENCE, restore_best_weights=True)

                if name == "MLP / ANN":
                    Xtr = X_scaled[train_indices]
                    ytr = y_scaled[train_indices]
                    Xv = X_scaled[valid_indices]
                    yv = y_scaled[valid_indices]
                    Xt = X_scaled[test_indices_arr]
                else:
                    Xtr, ytr = X_train_seq, y_train_seq
                    Xv, yv = X_valid_seq, y_valid_seq
                    Xt = X_test_seq

                model.fit(
                    Xtr, ytr,
                    validation_data=(Xv, yv),
                    epochs=DL_EPOCHS,
                    batch_size=DL_BATCH_SIZE,
                    callbacks=[callback],
                    verbose=0,
                    shuffle=False,
                )

                valid_scaled_pred = model.predict(Xv, verbose=0).reshape(-1, 1)
                test_scaled_pred = model.predict(Xt, verbose=0).reshape(-1, 1)
                valid_pred = scaler_y.inverse_transform(valid_scaled_pred).reshape(-1)
                test_pred = scaler_y.inverse_transform(test_scaled_pred).reshape(-1)

                valid_target = y_valid.values[-len(valid_pred):]
                valid_prev = y_prev_valid[-len(valid_pred):]
                test_target = y_test.values[-len(test_pred):]
                test_prev = y_prev_test[-len(test_pred):]

                valid_metrics = calculate_strategy_metrics(valid_target, valid_pred, valid_prev)
                test_metrics = calculate_strategy_metrics(test_target, test_pred, test_prev)
                elapsed = round((time.perf_counter() - t0) * 1000, 2)

                merged_metrics = attach_test_metrics(valid_metrics, test_metrics)
                merged_metrics.update({
                    "Type": "Deep Learning Models",
                    "ExecutionTimeMs": elapsed,
                    "ValidationRMSE": valid_metrics["RMSE"],
                    "WalkForwardRMSE": None,
                    "FeatureImportance": [],
                    "SequenceLookback": DL_LOOKBACK if name != "MLP / ANN" else 1,
                })
                metrics_summary[name] = merged_metrics
                fitted_models[name] = model

                test_dates = y_test.index[-len(test_pred):]
                comparison, error_stats = build_comparison(test_target, test_pred, test_dates)

                history = warm_buffer.copy()
                fallback_medians = X_train.median().fillna(0.0)
                future_preds = []
                for f_date in future_dates:
                    latest = get_latest_features(history, f_date, fallback_medians)
                    if name == "MLP / ANN":
                        scaled_input = scaler_X.transform(latest)
                    else:
                        # Recreate the sequence from the rolling history so the
                        # network actually receives DL_LOOKBACK sessions.
                        hist_features = engineer_features(history, shift_features=False)[FEATURE_COLS]
                        hist_features = hist_features.replace([np.inf, -np.inf], np.nan).ffill().bfill().fillna(fallback_medians).fillna(0.0)
                        hist_values = hist_features.tail(DL_LOOKBACK).to_numpy(dtype=float)
                        if len(hist_values) < DL_LOOKBACK:
                            pad = np.repeat(hist_values[:1], DL_LOOKBACK - len(hist_values), axis=0)
                            hist_values = np.vstack([pad, hist_values])
                        scaled_input = scaler_X.transform(hist_values).reshape(1, DL_LOOKBACK, -1)
                    pred_scaled = model.predict(scaled_input, verbose=0)
                    pred_price = float(scaler_y.inverse_transform(np.asarray(pred_scaled).reshape(-1, 1))[0, 0])
                    future_preds.append({"Date": f_date.strftime("%Y-%m-%d"), "Price": round(_safe_float(pred_price), 2)})
                    history, _ = append_forecast_row(history, f_date, pred_price, average_volume)

                model_results[name] = {
                    "metrics": merged_metrics,
                    "comparison": comparison,
                    "error_stats": error_stats,
                    "future": future_preds,
                }
            except Exception as exc:
                print(f"Deep-learning model {name} failed: {exc}")
    except Exception as exc:
        print(f"Deep-learning pipeline failed: {exc}")

    return metrics_summary, model_results, fitted_models


# -----------------------------------------------------------------------------
# Traditional time-series models
# -----------------------------------------------------------------------------
def fit_ts_model(name, series):
    if name == "ARIMA":
        return ARIMA(series, order=(1, 1, 1)).fit()
    if name == "SARIMA":
        return SARIMAX(series, order=(1, 1, 1), seasonal_order=(1, 1, 1, 5), enforce_stationarity=False, enforce_invertibility=False).fit(disp=False)
    if name == "Holt-Winters / ETS":
        return ExponentialSmoothing(series, trend="add", seasonal=None, initialization_method="estimated").fit()
    if name == "Exponential Smoothing":
        return Holt(series, initialization_method="estimated").fit()
    raise ValueError(name)


def ts_walk_forward_rmse(name, series, n_splits=2):
    # Statistical models are expensive; two expanding folds provide a useful
    # stability check without multiplying runtime unnecessarily.
    if len(series) < 300:
        return np.nan
    scores = []
    splitter = TimeSeriesSplit(n_splits=n_splits)
    for train_idx, valid_idx in splitter.split(series):
        fold_train = series.iloc[train_idx].asfreq("B").ffill().dropna()
        fold_valid = series.iloc[valid_idx]
        try:
            if name in {"ARIMA", "SARIMA", "Holt-Winters / ETS", "Exponential Smoothing"}:
                fitted = fit_ts_model(name, fold_train)
                pred = fitted.forecast(steps=len(fold_valid))
            else:
                raise ValueError(name)
            scores.append(np.sqrt(mean_squared_error(fold_valid, np.asarray(pred))))
        except Exception:
            continue
    return float(np.mean(scores)) if scores else np.nan


def prophet_predictions(train_series, dates):
    model = Prophet(daily_seasonality=False, weekly_seasonality=True, yearly_seasonality=True)
    train_df = pd.DataFrame({"ds": train_series.index, "y": train_series.values})
    model.fit(train_df)
    exact_dates = pd.DataFrame({"ds": pd.DatetimeIndex(dates)})
    forecast = model.predict(exact_dates)
    return forecast["yhat"].to_numpy()


def garch_price_forecast(series, steps):
    returns = series.pct_change().dropna() * 100.0
    if len(returns) < 100:
        raise ValueError("Insufficient return history for GARCH.")
    model = arch_model(returns, mean="Constant", vol="Garch", p=1, q=1, rescale=False)
    fitted = model.fit(disp="off", show_warning=False)
    forecast = fitted.forecast(horizon=steps, reindex=False)
    mean_returns_pct = np.asarray(forecast.mean.iloc[-1], dtype=float)
    current = float(series.iloc[-1])
    prices = []
    for mean_return_pct in mean_returns_pct:
        current *= 1.0 + _safe_float(mean_return_pct) / 100.0
        prices.append(current)
    return np.asarray(prices)


def run_ts_models(y_fit, y_train, y_valid, y_test, y_prev_valid, y_prev_test, future_dates, all_series):
    metrics_summary = {}
    model_results = {}
    names = ["ARIMA", "SARIMA", "Holt-Winters / ETS", "Exponential Smoothing"]

    # Test forecasts are generated strictly from the historical training sample.
    for idx, name in enumerate(names, start=1):
        set_job_status(progress=68 + idx * 2, message=f"Training time-series model {idx}/{len(names)}: {name}...")
        try:
            t0 = time.perf_counter()
            fit_ts = y_fit.asfreq("B").ffill().dropna()
            train_ts = y_train.asfreq("B").ffill().dropna()
            # Validation forecast is produced from the fit partition only.
            valid_fitted = fit_ts_model(name, fit_ts)
            valid_pred = np.asarray(valid_fitted.forecast(steps=len(y_valid)), dtype=float)
            # Test forecast is produced from train + validation, while the test
            # observations themselves remain completely unseen.
            fitted = fit_ts_model(name, train_ts)
            test_pred = np.asarray(fitted.forecast(steps=len(y_test)), dtype=float)

            # Final future forecast is refit on ALL pre-forecast observations.
            all_ts = all_series.asfreq("B").ffill().dropna()
            future_fitted = fit_ts_model(name, all_ts)
            future_pred = np.asarray(future_fitted.forecast(steps=len(future_dates)), dtype=float)
            elapsed = round((time.perf_counter() - t0) * 1000, 2)

            valid_metrics = calculate_strategy_metrics(y_valid.values, valid_pred, y_prev_valid)
            test_metrics = calculate_strategy_metrics(y_test.values, test_pred, y_prev_test)
            merged = attach_test_metrics(valid_metrics, test_metrics)
            wf_score = ts_walk_forward_rmse(name, fit_ts)
            merged.update({
                "Type": "Traditional Time-Series Models",
                "ExecutionTimeMs": elapsed,
                "ValidationRMSE": valid_metrics["RMSE"],
                "WalkForwardRMSE": round(float(wf_score), 2) if np.isfinite(wf_score) else None,
                "FeatureImportance": [],
            })
            metrics_summary[name] = merged

            comparison, error_stats = build_comparison(y_test.values, test_pred, y_test.index)
            model_results[name] = {
                "metrics": merged,
                "comparison": comparison,
                "error_stats": error_stats,
                "future": [
                    {"Date": date.strftime("%Y-%m-%d"), "Price": round(_safe_float(price), 2)}
                    for date, price in zip(future_dates, future_pred)
                ],
            }
        except Exception as exc:
            print(f"{name} failed: {exc}")

    if PROPHET_AVAILABLE:
        try:
            t0 = time.perf_counter()
            fit_prophet = y_fit.copy()
            train_prophet = y_train.copy()
            valid_pred = prophet_predictions(fit_prophet, y_valid.index)
            test_pred = prophet_predictions(train_prophet, y_test.index)
            future_pred = prophet_predictions(all_series, future_dates)
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            valid_metrics = calculate_strategy_metrics(y_valid.values, valid_pred, y_prev_valid)
            test_metrics = calculate_strategy_metrics(y_test.values, test_pred, y_prev_test)
            merged = attach_test_metrics(valid_metrics, test_metrics)
            merged.update({
                "Type": "Traditional Time-Series Models",
                "ExecutionTimeMs": elapsed,
                "ValidationRMSE": valid_metrics["RMSE"],
                "WalkForwardRMSE": None,
                "FeatureImportance": [],
            })
            metrics_summary["Prophet"] = merged
            comparison, error_stats = build_comparison(y_test.values, test_pred, y_test.index)
            model_results["Prophet"] = {
                "metrics": merged,
                "comparison": comparison,
                "error_stats": error_stats,
                "future": [
                    {"Date": date.strftime("%Y-%m-%d"), "Price": round(_safe_float(price), 2)}
                    for date, price in zip(future_dates, future_pred)
                ],
            }
        except Exception as exc:
            print(f"Prophet failed: {exc}")

    if GARCH_AVAILABLE:
        try:
            t0 = time.perf_counter()
            fit_garch = y_fit.asfreq("B").ffill().dropna()
            train_garch = y_train.asfreq("B").ffill().dropna()
            valid_pred = garch_price_forecast(fit_garch, len(y_valid))
            test_pred = garch_price_forecast(train_garch, len(y_test))
            future_pred = garch_price_forecast(all_series.asfreq("B").ffill().dropna(), len(future_dates))
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            valid_metrics = calculate_strategy_metrics(y_valid.values, valid_pred, y_prev_valid)
            test_metrics = calculate_strategy_metrics(y_test.values, test_pred, y_prev_test)
            merged = attach_test_metrics(valid_metrics, test_metrics)
            merged.update({
                "Type": "Traditional Time-Series Models",
                "ExecutionTimeMs": elapsed,
                "ValidationRMSE": valid_metrics["RMSE"],
                "WalkForwardRMSE": None,
                "FeatureImportance": [],
            })
            metrics_summary["GARCH"] = merged
            comparison, error_stats = build_comparison(y_test.values, test_pred, y_test.index)
            model_results["GARCH"] = {
                "metrics": merged,
                "comparison": comparison,
                "error_stats": error_stats,
                "future": [
                    {"Date": date.strftime("%Y-%m-%d"), "Price": round(_safe_float(price), 2)}
                    for date, price in zip(future_dates, future_pred)
                ],
            }
        except Exception as exc:
            print(f"GARCH failed: {exc}")

    return metrics_summary, model_results


# -----------------------------------------------------------------------------
# Main pipeline
# -----------------------------------------------------------------------------
def download_or_load_data(ticker, from_date, to_date):
    data_folder = Path(__file__).resolve().parent / "stock_cache"
    data_folder.mkdir(exist_ok=True)
    stock_name = ticker.removesuffix(".NS")
    cache_path = data_folder / f"{stock_name}_daily_data__{from_date}_{to_date}.csv"

    if cache_path.exists():
        set_job_status(progress=10, message=f"Loading cached data for {ticker}...")
        df = pd.read_csv(cache_path, index_col=0, parse_dates=True)
        return clean_ohlcv(df), cache_path

    set_job_status(progress=10, message=f"Downloading data for {ticker} between {from_date} and {to_date}...")
    download_end = (pd.Timestamp(to_date) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    df = yf.download(
        ticker,
        start=from_date,
        end=download_end,
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=False,
    )
    if df.empty:
        raise ValueError("No data returned from Yahoo Finance.")
    df = clean_ohlcv(df)
    df.to_csv(cache_path)
    return df, cache_path


def run_pipeline_background(ticker, from_date, to_date):
    global job_status
    try:
        _load_optional(ENABLE_DEEP_LEARNING)
        ticker = str(ticker or "").strip().upper()
        if not ticker:
            raise ValueError("No ticker was supplied.")
        if not ticker.endswith(".NS"):
            ticker += ".NS"

        raw_ohlcv, _ = download_or_load_data(ticker, from_date, to_date)
        raw_ohlcv = raw_ohlcv.loc[(raw_ohlcv.index >= pd.Timestamp(from_date)) & (raw_ohlcv.index <= pd.Timestamp(to_date))].copy()
        if raw_ohlcv.empty:
            raise ValueError("No trading data exists in the requested historical range.")

        set_job_status(progress=20, message="Engineering leakage-safe technical indicators...")
        df = engineer_features(raw_ohlcv, shift_features=True).replace([np.inf, -np.inf], np.nan).dropna()
        df = df.loc[df.index < FUTURE_FORECAST_START].copy()
        if len(df) < 500:
            raise ValueError("Not enough historical observations after feature engineering. At least 500 rows are recommended.")

        # Chronological 60/20/20 split. The final 20% is an untouched test set.
        n = len(df)
        fit_end = int(n * (1.0 - VALIDATION_FRACTION - TEST_FRACTION))
        valid_end = int(n * (1.0 - TEST_FRACTION))
        if fit_end < 200 or valid_end <= fit_end or valid_end >= n:
            raise ValueError("Dataset is too small for the requested train/validation/test split.")

        train_df = df.iloc[:fit_end].copy()
        valid_df = df.iloc[fit_end:valid_end].copy()
        test_df = df.iloc[valid_end:].copy()

        X_all = df[FEATURE_COLS].copy()
        y_all = df["Target_Close"].copy()
        X_fit, y_fit = train_df[FEATURE_COLS], train_df["Target_Close"]
        X_valid, y_valid = valid_df[FEATURE_COLS], valid_df["Target_Close"]
        X_train, y_train = df.iloc[:valid_end][FEATURE_COLS], df.iloc[:valid_end]["Target_Close"]
        X_test, y_test = test_df[FEATURE_COLS], test_df["Target_Close"]

        # Previous close is aligned to each target date. This is known at prediction time.
        y_prev_valid = df["Target_Close"].shift(1).loc[valid_df.index].to_numpy()
        y_prev_test = df["Target_Close"].shift(1).loc[test_df.index].to_numpy()

        # Actual OHLCV history is used up to the forecast boundary. Recursive forecast
        # rows are appended only after model prediction.
        warm_buffer = raw_ohlcv.loc[raw_ohlcv.index <= df.index[-1]].tail(WARM_BUFFER_SIZE).copy()
        average_volume = float(raw_ohlcv["Volume"].tail(60).mean())
        future_dates = build_future_dates()

        dataset_info = {
            "raw_start_date": df.index.min().strftime("%Y-%m-%d"),
            "raw_end_date": df.index.max().strftime("%Y-%m-%d"),
            "total_points": len(df),
            "train_count": len(train_df),
            "validation_count": len(valid_df),
            "test_count": len(test_df),
            "train_start_date": train_df.index.min().strftime("%Y-%m-%d"),
            "train_end_date": train_df.index.max().strftime("%Y-%m-%d"),
            "validation_start_date": valid_df.index.min().strftime("%Y-%m-%d"),
            "validation_end_date": valid_df.index.max().strftime("%Y-%m-%d"),
            "test_start_date": test_df.index.min().strftime("%Y-%m-%d"),
            "test_end_date": test_df.index.max().strftime("%Y-%m-%d"),
            "future_forecast_days": len(future_dates),
            "future_start_date": future_dates.min().strftime("%Y-%m-%d"),
            "future_end_date": future_dates.max().strftime("%Y-%m-%d"),
            "split_method": "Chronological 60% train / 20% validation / 20% untouched test",
            "feature_shift": "Price-derived features shifted by one session; calendar features unshifted",
            "transaction_cost_bps": TRANSACTION_COST_BPS,
        }

        all_metrics = {}
        all_results = {}

        ml_metrics, ml_results, _ = run_ml_models(
            X_fit, y_fit, X_valid, y_valid, X_train, y_train, X_test, y_test,
            y_prev_valid, y_prev_test, future_dates, warm_buffer, average_volume,
        )
        all_metrics.update(ml_metrics)
        all_results.update(ml_results)

        dl_metrics, dl_results, _ = run_deep_learning(
            X_all, y_all, fit_end, valid_end, X_train, y_train, y_valid, y_test,
            y_prev_valid, y_prev_test, np.arange(valid_end, n), future_dates, warm_buffer, average_volume,
        )
        all_metrics.update(dl_metrics)
        all_results.update(dl_results)

        ts_metrics, ts_results = run_ts_models(
            y_fit, y_train, y_valid, y_test, y_prev_valid, y_prev_test, future_dates, y_all,
        )
        all_metrics.update(ts_metrics)
        all_results.update(ts_results)

        if not all_metrics:
            raise ValueError("No model completed successfully.")

        # ------------------------------------------------------------------
        # Model selection: VALIDATION ONLY. The test set is never used to
        # choose the winner. Test metrics remain an unbiased post-selection
        # report for the selected model.
        # ------------------------------------------------------------------
        eligible = [
            name for name, metrics in all_metrics.items()
            if metrics.get("ValidationPassesGates", False)
        ]

        if eligible:
            selection_pool = eligible
            selection_fallback = False
        else:
            # If no model clears all validation gates, choose the highest
            # validation SelectionScore but explicitly flag the fallback.
            selection_pool = list(all_metrics.keys())
            selection_fallback = True

        best_name = max(
            selection_pool,
            key=lambda name: calculate_selection_score(all_metrics[name]),
        )

        # Add a small stability diagnostic: models are not treated as equally
        # reliable merely because their point score is close.
        sorted_validation = sorted(
            ((name, calculate_selection_score(metrics)) for name, metrics in all_metrics.items()),
            key=lambda x: x[1],
            reverse=True,
        )
        runner_up_score = sorted_validation[1][1] if len(sorted_validation) > 1 else None
        selection_margin = None if runner_up_score is None else round(sorted_validation[0][1] - runner_up_score, 2)

        importance_candidates = [
            (name, metrics) for name, metrics in all_metrics.items() if metrics.get("FeatureImportance")
        ]
        if all_metrics.get(best_name, {}).get("FeatureImportance"):
            importance_model = best_name
        elif importance_candidates:
            importance_model = max(importance_candidates, key=lambda x: calculate_selection_score(x[1]))[0]
        else:
            importance_model = None

        result = {
            "ticker": ticker,
            "best_model": best_name,
            "selection_is_fallback": selection_fallback,
            "selection_basis": "Validation-only composite score with validation quality gates; final test set is not used for model selection.",
            "selection_margin_vs_runner_up": selection_margin,
            "validation_gated_models": eligible,
            "feature_importance_model": importance_model,
            "top_feature_importance": all_metrics.get(importance_model, {}).get("FeatureImportance", []) if importance_model else [],
            "dataset_info": dataset_info,
            "forecast_window": {
                "history_ends": (FUTURE_FORECAST_START - pd.Timedelta(days=1)).strftime("%Y-%m-%d"),
                "forecast_start": FUTURE_FORECAST_START.strftime("%Y-%m-%d"),
                "forecast_end": FUTURE_FORECAST_END.strftime("%Y-%m-%d"),
            },
            "generated_at": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M"),
            "model_results": all_results,
        }

        set_job_status(progress=100, message="Complete!", completed=True, result=result, error=None)
    except Exception as exc:
        print(f"Pipeline failed: {exc}")
        set_job_status(progress=100, message="Error occurred", completed=True, result=None, error=str(exc))


# -----------------------------------------------------------------------------
# Public API used by server.py
# -----------------------------------------------------------------------------
def configure_forecast_window(horizon_months):
    global FUTURE_FORECAST_START, FUTURE_FORECAST_END
    horizon_months = max(1, min(24, int(horizon_months)))
    FUTURE_FORECAST_START = pd.Timestamp.today().normalize()
    FUTURE_FORECAST_END = FUTURE_FORECAST_START + pd.DateOffset(months=horizon_months)


def capabilities():
    return {
        "xgboost": XGBOOST_AVAILABLE, "lightgbm": LIGHTGBM_AVAILABLE, "catboost": CATBOOST_AVAILABLE,
        "prophet": PROPHET_AVAILABLE, "arch": GARCH_AVAILABLE, "tensorflow": DL_AVAILABLE,
    }


def get_status():
    with job_lock:
        return dict(job_status)


def start_job(ticker, horizon_months=6, deep_learning=True):
    """Start one analysis in a background thread. Returns (payload, http_status)."""
    global job_status, ENABLE_DEEP_LEARNING
    ticker = str(ticker or "").strip().upper()
    if not ticker or len(ticker) > 25 or not re.fullmatch(r"[A-Z0-9&.\-]+", ticker):
        return {"status": "error", "message": "Please choose a valid stock symbol."}, 400
    with job_lock:
        if job_status.get("completed") is False and job_status.get("progress", 0) > 0:
            return {"status": "busy", "message": "An analysis is already running. Please wait for it to finish."}, 409
        configure_forecast_window(horizon_months)
        ENABLE_DEEP_LEARNING = bool(deep_learning)
        to_date = FUTURE_FORECAST_START - pd.Timedelta(days=1)
        from_date = FUTURE_FORECAST_START - pd.DateOffset(years=TRAINING_LOOKBACK_YEARS)
        job_status = {"progress": 1, "message": "Starting...", "completed": False, "result": None, "error": None}
    threading.Thread(
        target=run_pipeline_background,
        args=(ticker, from_date.strftime("%Y-%m-%d"), to_date.strftime("%Y-%m-%d")),
        daemon=True,
    ).start()
    return {"status": "started"}, 200
