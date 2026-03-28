(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  root.SnakeLogic = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_GRID_SIZE = 16;
  const DEFAULT_DIRECTION = "RIGHT";
  const DIRECTION_VECTORS = Object.freeze({
    UP: Object.freeze({ x: 0, y: -1 }),
    DOWN: Object.freeze({ x: 0, y: 1 }),
    LEFT: Object.freeze({ x: -1, y: 0 }),
    RIGHT: Object.freeze({ x: 1, y: 0 }),
  });
  const OPPOSITE_DIRECTIONS = Object.freeze({
    UP: "DOWN",
    DOWN: "UP",
    LEFT: "RIGHT",
    RIGHT: "LEFT",
  });

  function cloneCell(cell) {
    return { x: cell.x, y: cell.y };
  }

  function cloneSnake(snake) {
    return snake.map(cloneCell);
  }

  function normalizeDirection(direction) {
    const value = String(direction || "").toUpperCase();
    return DIRECTION_VECTORS[value] ? value : null;
  }

  function isOppositeDirection(currentDirection, nextDirection) {
    return OPPOSITE_DIRECTIONS[currentDirection] === nextDirection;
  }

  function isSameCell(firstCell, secondCell) {
    return firstCell.x === secondCell.x && firstCell.y === secondCell.y;
  }

  function createInitialSnake(gridSize) {
    const startX = Math.floor(gridSize / 2);
    const startY = Math.floor(gridSize / 2);

    return [
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
  }

  function clampRandomValue(value) {
    if (!Number.isFinite(value)) {
      return Math.random();
    }

    if (value <= 0) {
      return 0;
    }

    if (value >= 1) {
      return 0.999999999999;
    }

    return value;
  }

  function listEmptyCells(gridSize, snake) {
    const occupied = new Set(snake.map((segment) => `${segment.x},${segment.y}`));
    const emptyCells = [];

    for (let y = 0; y < gridSize; y += 1) {
      for (let x = 0; x < gridSize; x += 1) {
        const key = `${x},${y}`;

        if (!occupied.has(key)) {
          emptyCells.push({ x, y });
        }
      }
    }

    return emptyCells;
  }

  function spawnFood(gridSize, snake, rng) {
    const emptyCells = listEmptyCells(gridSize, snake);

    if (!emptyCells.length) {
      return null;
    }

    const randomValue = clampRandomValue(typeof rng === "function" ? rng() : Math.random());
    const foodIndex = Math.floor(randomValue * emptyCells.length);
    return emptyCells[foodIndex];
  }

  function createInitialState(config) {
    const options = config || {};
    const gridSize =
      Number.isInteger(options.gridSize) && options.gridSize >= 4
        ? options.gridSize
        : DEFAULT_GRID_SIZE;
    const snake = cloneSnake(options.snake || createInitialSnake(gridSize));
    const direction = normalizeDirection(options.direction) || DEFAULT_DIRECTION;
    let food;

    if (Object.prototype.hasOwnProperty.call(options, "food")) {
      food = options.food ? cloneCell(options.food) : null;
    } else {
      food = spawnFood(gridSize, snake, options.rng);
    }

    return {
      gridSize,
      snake,
      direction,
      nextDirection: direction,
      food,
      score: Number.isInteger(options.score) ? options.score : 0,
      gameOver: false,
      won: false,
      paused: false,
      collision: null,
    };
  }

  function queueDirection(state, direction) {
    const nextDirection = normalizeDirection(direction);

    if (!nextDirection || state.gameOver) {
      return state;
    }

    if (state.snake.length > 1 && isOppositeDirection(state.direction, nextDirection)) {
      return state;
    }

    if (state.nextDirection === nextDirection) {
      return state;
    }

    return {
      ...state,
      nextDirection,
    };
  }

  function stepState(state, options) {
    if (state.gameOver || state.won || state.paused) {
      return state;
    }

    const settings = options || {};
    const direction = normalizeDirection(state.nextDirection) || state.direction;
    const movement = DIRECTION_VECTORS[direction];
    const nextHead = {
      x: state.snake[0].x + movement.x,
      y: state.snake[0].y + movement.y,
    };

    const hitsWall =
      nextHead.x < 0 ||
      nextHead.y < 0 ||
      nextHead.x >= state.gridSize ||
      nextHead.y >= state.gridSize;

    if (hitsWall) {
      return {
        ...state,
        direction,
        nextDirection: direction,
        gameOver: true,
        collision: "wall",
      };
    }

    const ateFood = Boolean(state.food && isSameCell(nextHead, state.food));
    const nextSnake = [nextHead, ...cloneSnake(state.snake)];

    if (!ateFood) {
      nextSnake.pop();
    }

    const hitsSelf = nextSnake.slice(1).some((segment) => isSameCell(segment, nextHead));

    if (hitsSelf) {
      return {
        ...state,
        direction,
        nextDirection: direction,
        gameOver: true,
        collision: "self",
      };
    }

    const nextState = {
      ...state,
      snake: nextSnake,
      direction,
      nextDirection: direction,
      collision: null,
    };

    if (!ateFood) {
      return nextState;
    }

    const food = spawnFood(state.gridSize, nextSnake, settings.rng);
    const won = food === null;

    return {
      ...nextState,
      food,
      score: state.score + 1,
      won,
      gameOver: won,
    };
  }

  return {
    DEFAULT_GRID_SIZE,
    DEFAULT_DIRECTION,
    DIRECTION_VECTORS,
    createInitialState,
    queueDirection,
    spawnFood,
    stepState,
  };
});
