const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

test.describe('wigle.html', () => {
  test('loads without console errors', async ({ page }) => {
    const filePath = path.resolve(__dirname, '..', 'wigle.html');
    const fileUrl = pathToFileURL(filePath).href;

    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push({
          type: message.type(),
          text: message.text(),
        });
      }
    });

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    expect(consoleErrors, '페이지 로드 중 콘솔 에러가 없어야 합니다.').toEqual(
      [],
    );
  });

  test('updates uniforms when diffusion rate changes', async ({ page }) => {
    const filePath = path.resolve(__dirname, '..', 'wigle.html');
    const fileUrl = pathToFileURL(filePath).href;

    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForFunction(() => window.energyLifeSim !== undefined);
    await page.waitForTimeout(500);

    const initialUniform = await page.evaluate(
      () =>
        window.energyLifeSim.computeVariables.field.material.uniforms
          .diffusionRate.value,
    );
    expect(initialUniform).toBeCloseTo(0.333, 3);

    await page.evaluate(() => {
      const slider = document.getElementById('diffusionRate');
      slider.value = '0.35';
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    await page.waitForFunction(
      () =>
        Math.abs(
          window.energyLifeSim.computeVariables.field.material.uniforms
            .diffusionRate.value - 0.35,
        ) < 1e-4,
    );

    const inputValue = await page.locator('#diffusionRateValue').inputValue();
    expect(parseFloat(inputValue)).toBeCloseTo(0.35, 3);

    const avgBefore = await page.locator('#avgEnergy').innerText();
    await page.waitForTimeout(500);
    const avgAfter = await page.locator('#avgEnergy').innerText();
    expect(avgAfter.startsWith('Avg: ')).toBeTruthy();
    const numeric = parseFloat(avgAfter.replace('Avg: ', ''));
    expect(Number.isFinite(numeric)).toBeTruthy();
    expect(numeric).toBeGreaterThanOrEqual(0);
    expect(numeric).toBeLessThanOrEqual(1);
  });
});
