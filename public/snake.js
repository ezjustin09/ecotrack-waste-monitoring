(function () {
  "use strict";

  const SnakeLogic = window.SnakeLogic;

  if (!SnakeLogic) {
    throw new Error("Snake logic failed to load.");
  }

  const GRID_SIZE = 16;
  const TICK_MS = 150;
  const DIRECTION_KEYS = {
    ArrowUp: "UP",
    ArrowDown: "DOWN",
    ArrowLeft: "LEFT",
    ArrowRight: "RIGHT",
    w: "UP",
    W: "UP",
    a: "LEFT",
    A: "LEFT",
    s: "DOWN",
    S: "DOWN",
    d: "RIGHT",
    D: "RIGHT",
  };

  const dom = {
    board: document.getElementById("snakeBoard"),
    scoreValue: document.getElementById("scoreValue"),
    gameStatus: document.getElementById("gameStatus"),
    gameMessage: document.getElementById("gameMessage"),
    pauseButton: document.getElementById("pauseButton"),
    restartButton: document.getElementById("restartButton"),
  };

  const runtime = {
    game: SnakeLogic.createInitialState({ gridSize: GRID_SIZE }),
    timerId: null,
    cells: [],
  };

  function cellIndex(x, y) {
    return y * GRID_SIZE + x;
  }

  function buildBoard() {
    const fragment = document.createDocumentFragment();
    dom.board.style.setProperty("--snake-grid-size", String(GRID_SIZE));

    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const cell = document.createElement("div");
        cell.className = "snake-cell";
        cell.setAttribute("role", "gridcell");
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        fragment.appendChild(cell);
      }
    }

    dom.board.replaceChildren(fragment);
    runtime.cells = Array.from(dom.board.children);
  }

  function stopLoop() {
    if (runtime.timerId !== null) {
      window.clearInterval(runtime.timerId);
      runtime.timerId = null;
    }
  }

  function startLoop() {
    stopLoop();

    if (runtime.game.gameOver || runtime.game.paused) {
      return;
    }

    runtime.timerId = window.setInterval(tick, TICK_MS);
  }

  function statusConfig(game) {
    if (game.won) {
      return {
        label: "Cleared",
        className: "status-completed",
        message: "You filled the board. Restart to play again.",
      };
    }

    if (game.gameOver) {
      return {
        label: "Game over",
        className: "status-delayed",
        message: "Crash detected. Press restart to begin a fresh run.",
      };
    }

    if (game.paused) {
      return {
        label: "Paused",
        className: "status-planned",
        message: "Game paused. Press resume or Space to continue.",
      };
    }

    return {
      label: "Running",
      className: "status-on-schedule",
      message: "Collect the food and keep moving.",
    };
  }

  function render() {
    const { game } = runtime;
    const { label, className, message } = statusConfig(game);

    dom.scoreValue.textContent = String(game.score);
    dom.gameStatus.textContent = label;
    dom.gameStatus.className = `status-pill ${className}`;
    dom.gameMessage.textContent = message;
    dom.pauseButton.textContent = game.paused ? "Resume" : "Pause";
    dom.pauseButton.disabled = game.gameOver;

    runtime.cells.forEach((cell) => {
      cell.className = "snake-cell";
    });

    if (game.food) {
      runtime.cells[cellIndex(game.food.x, game.food.y)].classList.add("snake-cell-food");
    }

    game.snake.forEach((segment, index) => {
      const cell = runtime.cells[cellIndex(segment.x, segment.y)];
      cell.classList.add("snake-cell-snake");

      if (index === 0) {
        cell.classList.add("snake-cell-head");
      }
    });
  }

  function tick() {
    runtime.game = SnakeLogic.stepState(runtime.game);
    render();

    if (runtime.game.gameOver) {
      stopLoop();
    }
  }

  function changeDirection(direction) {
    runtime.game = SnakeLogic.queueDirection(runtime.game, direction);
    render();
  }

  function togglePause() {
    if (runtime.game.gameOver) {
      return;
    }

    runtime.game = {
      ...runtime.game,
      paused: !runtime.game.paused,
    };
    render();

    if (runtime.game.paused) {
      stopLoop();
      return;
    }

    startLoop();
  }

  function restartGame() {
    runtime.game = SnakeLogic.createInitialState({ gridSize: GRID_SIZE });
    render();
    startLoop();
    dom.board.focus();
  }

  function handleKeydown(event) {
    if (event.code === "Space") {
      event.preventDefault();
      togglePause();
      return;
    }

    const direction = DIRECTION_KEYS[event.key];

    if (!direction) {
      return;
    }

    event.preventDefault();
    changeDirection(direction);
  }

  function attachEventListeners() {
    window.addEventListener("keydown", handleKeydown);
    dom.pauseButton.addEventListener("click", togglePause);
    dom.restartButton.addEventListener("click", restartGame);
    dom.board.addEventListener("click", () => {
      dom.board.focus();
    });

    document.addEventListener("click", (event) => {
      const controlButton = event.target.closest("[data-direction]");

      if (!controlButton) {
        return;
      }

      changeDirection(controlButton.dataset.direction);
      dom.board.focus();
    });
  }

  buildBoard();
  attachEventListeners();
  restartGame();
})();
