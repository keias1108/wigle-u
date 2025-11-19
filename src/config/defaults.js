/**
 * Default Simulation Parameters
 *
 * These values define the initial state of the simulation.
 * Each parameter is carefully tuned to produce interesting emergent patterns.
 */

/**
 * Default parameter values for the energy lifecycle simulation
 *
 * @typedef {Object} SimulationParams
 * @property {number} innerRadius - Inner attraction zone radius (grid cells)
 * @property {number} innerStrength - Inner attraction strength (positive = attract)
 * @property {number} outerRadius - Outer repulsion zone radius (grid cells)
 * @property {number} outerStrength - Outer repulsion strength (negative = repel)
 * @property {number} growthCenter - Center of growth function bell curve
 * @property {number} growthWidth - Width of growth function bell curve
 * @property {number} growthRate - Growth speed multiplier
 * @property {number} suppressionFactor - Global population suppression factor
 * @property {number} decayRate - Energy metabolism rate (quadratic decay)
 * @property {number} diffusionRate - Energy diffusion rate (Laplacian)
 * @property {number} fissionThreshold - Energy level triggering instability
 * @property {number} instabilityFactor - Fission chaos strength
 */
export const DEFAULT_PARAMS = {
  // Dynamic Tension: controls neighbor interactions
  innerRadius: 3.5,
  innerStrength: 0.9,
  outerRadius: 7.5,
  outerStrength: -0.4,

  // Growth Function: controls energy gain/loss based on neighbors
  growthCenter: -0.17,
  growthWidth: 0.0183,
  growthRate: 0.607,

  // Global suppression (prevents overpopulation)
  suppressionFactor: 1.0,

  // Energy Economy: controls energy lifecycle
  decayRate: 0.378,
  diffusionRate: 0.333,
  fissionThreshold: 0.796,
  instabilityFactor: 1.5,
};

/**
 * UI control IDs that map to simulation parameters
 * Used for automatic slider/input binding
 */
export const PARAM_CONTROL_IDS = [
  'innerRadius',
  'innerStrength',
  'outerRadius',
  'outerStrength',
  'growthCenter',
  'growthWidth',
  'growthRate',
  'decayRate',
  'diffusionRate',
  'fissionThreshold',
];

/**
 * Speed preset configurations
 * Maps UI buttons to simulation speed multipliers
 */
export const SPEED_PRESETS = [
  { selector: '.speed-btn[data-speed="0"]', value: 0 }, // Pause
  { selector: '.speed-btn[data-speed="1"]', value: 1 }, // Normal
  { selector: '.speed-btn[data-speed="2"]', value: 2 }, // 2x
  { selector: '.speed-btn[data-speed="5"]', value: 5 }, // 5x
];
