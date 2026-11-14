/* The Impossible Number Game
   The final secret is chosen after guess six from the surviving interval.
   Every clue is truthful relative to that final secret, which is never a
   previously submitted guess. */
(() => {
    "use strict";

    const MIN = 1;
    const MAX = 100;
    const MAX_GUESSES = 6;

    const form = document.getElementById("number-guess-form");
    if (!form) return;

    const input = document.getElementById("number-guess");
    const submitButton = document.getElementById("submit-guess");
    const feedback = document.getElementById("guess-feedback");
    const feedbackDirection = document.getElementById("feedback-direction");
    const feedbackDetail = document.getElementById("feedback-detail");
    const historyContainer = document.getElementById("guess-history");
    const result = document.getElementById("game-result");

    let low;
    let high;
    let guesses;
    let finished;
    let secret;

    function randomInteger(min, max) {
        // Inclusive. The surviving range is small and this is a casual puzzle.
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function resetGame() {
        low = MIN;
        high = MAX;
        guesses = [];
        finished = false;
        secret = null;

        input.value = "";
        input.disabled = false;
        submitButton.disabled = false;

        document.getElementById("secret-display").textContent = "? ? ?";
        document.getElementById("secret-caption").textContent = "Revealed after your sixth guess";
        document.getElementById("chances-remaining").textContent = "6 of 6";
        document.getElementById("chance-track").innerHTML =
            Array.from({ length: MAX_GUESSES }, () => '<span class="pip"></span>').join("");
        document.getElementById("input-help").textContent = "Enter a whole number between 1 and 100.";
        document.getElementById("history-count").textContent = "0 guesses";
        historyContainer.innerHTML = '<p class="ng-empty">Your guesses will appear here.</p>';
        feedback.hidden = true;
        result.hidden = true;
    }

    function chooseLargerRemainingInterval(number) {
        const leftLow = low;
        const leftHigh = number - 1;
        const rightLow = number + 1;
        const rightHigh = high;

        const leftSize = Math.max(0, leftHigh - leftLow + 1);
        const rightSize = Math.max(0, rightHigh - rightLow + 1);

        let keepLeft;
        if (leftSize > rightSize) {
            keepLeft = true;
        } else if (rightSize > leftSize) {
            keepLeft = false;
        } else {
            keepLeft = Math.random() < 0.5;
        }

        if (keepLeft) {
            low = leftLow;
            high = leftHigh;
            return "LOWER";
        }

        low = rightLow;
        high = rightHigh;
        return "HIGHER";
    }

    function renderHistory() {
        historyContainer.innerHTML = guesses.map((item, index) => {
            const clueClass = item.clue === "LOWER" ? "lower" : "higher";
            const arrow = item.clue === "LOWER" ? "↓" : "↑";
            return `<div class="guess-row">
                <span>Attempt ${index + 1} <strong>${item.number}</strong></span>
                <span class="guess-clue ${clueClass}">${item.clue} ${arrow}</span>
            </div>`;
        }).join("");

        document.getElementById("history-count").textContent =
            `${guesses.length} ${guesses.length === 1 ? "guess" : "guesses"}`;
        document.getElementById("chances-remaining").textContent =
            `${MAX_GUESSES - guesses.length} of ${MAX_GUESSES}`;
        document.getElementById("chance-track").innerHTML =
            Array.from({ length: MAX_GUESSES }, (_, index) =>
                `<span class="pip${index < guesses.length ? " on" : ""}"></span>`
            ).join("");
    }

    function finishGame() {
        // At six turns at least one candidate remains. Choose it only now,
        // ensuring the final answer is not any of the player's guesses.
        secret = randomInteger(low, high);
        finished = true;

        input.disabled = true;
        submitButton.disabled = true;
        document.getElementById("secret-display").textContent = String(secret);
        document.getElementById("secret-caption").textContent = "Your secret number has been revealed";
        document.getElementById("revealed-number").textContent = String(secret);
        result.hidden = false;
        document.getElementById("input-help").textContent = `The final possible range was ${low}–${high}.`;
    }

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (finished) return;

        const number = Number(input.value);
        if (!Number.isInteger(number) || number < MIN || number > MAX) {
            feedback.hidden = false;
            feedbackDirection.textContent = "Please enter a valid number.";
            feedbackDetail.textContent = "Use a whole number from 1 to 100.";
            input.focus();
            return;
        }

        let clue;
        if (number < low) {
            // The final number must be above this out-of-range guess.
            clue = "HIGHER";
        } else if (number > high) {
            // The final number must be below this out-of-range guess.
            clue = "LOWER";
        } else {
            clue = chooseLargerRemainingInterval(number);
        }

        guesses.push({ number, clue });
        renderHistory();

        feedback.hidden = false;
        feedbackDirection.textContent = clue === "HIGHER" ? "HIGHER ↑" : "LOWER ↓";
        feedbackDetail.textContent = `Your guess was ${number}. Try again!`;

        if (guesses.length === MAX_GUESSES) {
            finishGame();
        } else {
            document.getElementById("input-help").textContent =
                `Guess any number from 1 to 100. ${MAX_GUESSES - guesses.length} chances left.`;
            input.value = "";
            input.focus();
        }
    });

    document.getElementById("new-game").addEventListener("click", resetGame);
    resetGame();
})();
