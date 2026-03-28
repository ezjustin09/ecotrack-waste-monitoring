const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createInitialState,
  queueDirection,
  spawnFood,
  stepState,
} = require("../public/snake-logic.js");

test("stepState moves the snake forward and keeps its length without food", () => {
  const state = createInitialState({
    gridSize: 8,
    snake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ],
    direction: "RIGHT",
    food: { x: 6, y: 6 },
  });

  const nextState = stepState(state);

  assert.deepEqual(nextState.snake, [
    { x: 4, y: 3 },
    { x: 3, y: 3 },
    { x: 2, y: 3 },
  ]);
  assert.equal(nextState.score, 0);
  assert.equal(nextState.gameOver, false);
});

test("queueDirection ignores direct reversal but accepts a perpendicular turn", () => {
  const initialState = createInitialState({
    gridSize: 8,
    snake: [
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
    ],
    direction: "RIGHT",
    food: { x: 6, y: 6 },
  });

  const rejectedTurn = queueDirection(initialState, "LEFT");
  const acceptedTurn = queueDirection(initialState, "UP");

  assert.equal(rejectedTurn.nextDirection, "RIGHT");
  assert.equal(acceptedTurn.nextDirection, "UP");
});

test("stepState grows the snake, increments score, and respawns food off the snake", () => {
  const state = createInitialState({
    gridSize: 6,
    snake: [
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ],
    direction: "RIGHT",
    food: { x: 3, y: 2 },
  });

  const nextState = stepState(state, { rng: () => 0 });

  assert.equal(nextState.score, 1);
  assert.equal(nextState.snake.length, 4);
  assert.deepEqual(nextState.snake[0], { x: 3, y: 2 });
  assert.deepEqual(nextState.food, { x: 0, y: 0 });
  assert.equal(
    nextState.snake.some(
      (segment) => segment.x === nextState.food.x && segment.y === nextState.food.y
    ),
    false
  );
});

test("stepState ends the game when the snake hits a wall", () => {
  const state = createInitialState({
    gridSize: 5,
    snake: [
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
    ],
    direction: "RIGHT",
    food: { x: 0, y: 0 },
  });

  const nextState = stepState(state);

  assert.equal(nextState.gameOver, true);
  assert.equal(nextState.collision, "wall");
});

test("stepState ends the game when the snake hits its own body", () => {
  const state = createInitialState({
    gridSize: 6,
    snake: [
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
    ],
    direction: "UP",
    food: { x: 0, y: 0 },
  });

  const nextState = stepState(state);

  assert.equal(nextState.gameOver, true);
  assert.equal(nextState.collision, "self");
});

test("spawnFood returns null when the board has no empty cells", () => {
  const snake = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];

  assert.equal(spawnFood(2, snake, () => 0.5), null);
});
