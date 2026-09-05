import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const DASHLAB_REF = path.resolve('/home/kyle/Downloads/dashlab.png');

test.describe('Jarvis SIEM Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#root', { state: 'attached' });
    await page.waitForTimeout(2500);
  });

  test('homepage loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle('D.I.V.A // SIEM');
    await expect(page.locator('#root')).toBeDefined();
  });

  test('header elements are visible', async ({ page }) => {
    await expect(page.getByText('D.I.V.A // SIEM').first()).toBeVisible();
    await expect(page.getByText('WS: LIVE').first()).toBeVisible();
    await expect(page.getByText('THREAT:').first()).toBeVisible();
    await expect(page.getByText('AGENTS:').first()).toBeVisible();
    await expect(page.getByText('VOICE:').first()).toBeVisible();
  });

  test('all panels render with correct titles', async ({ page }) => {
    const panels = [
      'SYSTEM DIAGNOSTICS',
      'FLIGHT // NAVIGATION',
      'CLUSTER STORAGE',
      'THREAT TOPOLOGY',
      'INCIDENT FEED',
      'POWER & STATUS',
      'PROJECT MANAGEMENT',
      'KANBAN BOARD',
      'VOICE INTERFACE',
    ];

    for (const panel of panels) {
      await expect(page.getByRole('heading', { name: panel }).first()).toBeVisible();
    }
  });

  test('digital clock displays time', async ({ page }) => {
    const clockText = page.locator('text=/^\\d{2}:\\d{2}$/').first();
    await expect(clockText).toBeVisible();
  });

  test('threat topology canvas renders', async ({ page }) => {
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100);
    expect(box!.height).toBeGreaterThan(100);
  });

  test('circular HUD renders', async ({ page }) => {
    const canvas = page.locator('canvas').nth(1);
    await expect(canvas).toBeVisible();
  });

  test('voice panel renders', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /VOICE INTERFACE/ }).first()).toBeVisible();
  });

  test('incident feed has entries', async ({ page }) => {
    const alerts = page.locator('text=/SSH|Ransomware|Failed login|Port scan/');
    await expect(alerts.first()).toBeVisible();
  });

  test('storage panel shows cluster storage info', async ({ page }) => {
    await expect(page.getByText('CLUSTER STORAGE').first()).toBeVisible();
    await expect(page.getByText('AVAILABLE').first()).toBeVisible();
    const storage = await page.request.get('/api/storage');
    expect(storage.ok()).toBeTruthy();
  });

  test('power status shows charge and capacity', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'POWER & STATUS' }).first()).toBeVisible();
    await expect(page.getByText('CHARGE').first()).toBeVisible();
    await expect(page.getByText('CAPACITY').first()).toBeVisible();
  });

  test('websocket connection is live', async ({ page }) => {
    await expect(page.getByText('WS: LIVE').first()).toBeVisible();
  });

  test('agents endpoint returns data', async ({ page }) => {
    const response = await page.request.get('/api/agents');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.agents.length).toBeGreaterThan(0);
  });

  test('alerts endpoint returns data', async ({ page }) => {
    const response = await page.request.get('/api/alerts');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.alerts.length).toBeGreaterThan(0);
  });

  test('metrics endpoint returns data', async ({ page }) => {
    const response = await page.request.get('/api/metrics');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.metrics.length).toBeGreaterThan(0);
  });

  test('voice events endpoint returns data', async ({ page }) => {
    const response = await page.request.get('/api/voice/events');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data.voiceEvents.length).toBeGreaterThan(0);
  });
});
