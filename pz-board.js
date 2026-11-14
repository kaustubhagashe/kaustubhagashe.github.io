/* Shared helpers for the board-based puzzles (Eight Queens, Knight's Tour). */
window.PZ = (function () {
  var FILES = 'abcdefgh';
  function name(i) { return FILES[i % 8] + (8 - Math.floor(i / 8)); }   // index 0 = a8 (top-left)
  function row(i) { return Math.floor(i / 8); }
  function col(i) { return i % 8; }
  function piece(code) {
    var img = document.createElement('img');
    img.src = 'img/pieces/' + code + '.svg'; img.alt = ''; img.draggable = false; img.className = 'pz-piece';
    return img;
  }
  // Fills `board` with 64 square buttons. Returns the array of squares.
  function build(board, onClick) {
    var sq = [];
    for (var i = 0; i < 64; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pz-sq ' + (((row(i) + col(i)) % 2 === 0) ? 'light' : 'dark');
      b.dataset.i = i;
      b.setAttribute('role', 'gridcell');
      if (col(i) === 0) { var r = document.createElement('span'); r.className = 'pz-coord rk'; r.textContent = 8 - row(i); b.appendChild(r); }
      if (row(i) === 7) { var f = document.createElement('span'); f.className = 'pz-coord fl'; f.textContent = FILES[col(i)]; b.appendChild(f); }
      b.addEventListener('click', (function (idx) { return function () { onClick(idx); }; })(i));
      board.appendChild(b); sq.push(b);
    }
    return sq;
  }
  return { name: name, row: row, col: col, piece: piece, build: build };
})();
