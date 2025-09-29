import { EnergyLifeSimulation } from './app.js';

window.addEventListener('DOMContentLoaded', () => {
  const simulation = new EnergyLifeSimulation({
    canvasSelector: '#canvas',
    containerSelector: '#canvasContainer',
    controlsSelector: '#controls',
    chartCanvasSelector: '#chartCanvas',
  });

  simulation.init();
  window.energyLifeSim = simulation;
});
