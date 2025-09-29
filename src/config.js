export const SIMULATION_SIZE = 512;
export const INITIAL_CANVAS_WIDTH = 800;
export const INITIAL_CANVAS_HEIGHT = 600;

export const DEFAULT_PARAMS = {
  innerRadius: 3.5,
  innerStrength: 0.9,
  outerRadius: 7.5,
  outerStrength: -0.4,
  growthCenter: -0.17,
  growthWidth: 0.0183,
  growthRate: 0.607,
  suppressionFactor: 1.0,
  decayRate: 0.378,
  diffusionRate: 0.333,
  fissionThreshold: 0.796,
  instabilityFactor: 1.5,
};

export const SPEED_PRESETS = [
  { selector: '.speed-btn[data-speed="0"]', value: 0 },
  { selector: '.speed-btn[data-speed="1"]', value: 1 },
  { selector: '.speed-btn[data-speed="2"]', value: 2 },
  { selector: '.speed-btn[data-speed="5"]', value: 5 },
];

export const INTERACTION_MODES = ['energy', 'attract', 'repel'];

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

export const INTERACTION_RADIUS = 20;
export const CHART_HISTORY_LENGTH = 100;
