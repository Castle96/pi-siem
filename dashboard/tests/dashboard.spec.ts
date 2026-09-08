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

test.describe('Multi-endpoint monitoring', () => {
  const TEST_IPS = ['10.99.99.71', '10.99.99.72', '10.99.99.73', '10.99.99.74'];
  let workerIdx = 0;

  async function removeIfNeeded(page, ip) {
    await page.request.post('/api/endpoints', { data: { action: 'remove', ip } });
  }

  test.beforeEach(async ({ page }) => {
    workerIdx += 1;
    await removeIfNeeded(page, TEST_IPS[workerIdx - 1]);
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#root', { state: 'attached' });
    await page.waitForTimeout(2000);
  });

  test('endpoints api add/get/remove roundtrip', async ({ page }) => {
    const ip = TEST_IPS[0];
    const add = await page.request.post('/api/endpoints', { data: { action: 'add', ip, label: 'roundtrip-box' } });
    expect(add.ok()).toBeTruthy();
    expect(['added', 'exists']).toContain((await add.json()).action);

    const list = await page.request.get('/api/endpoints');
    expect(list.ok()).toBeTruthy();
    const entry = (await list.json()).endpoints.find(e => e.ip === ip);
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('roundtrip-box');

    const rem = await page.request.post('/api/endpoints', { data: { action: 'remove', ip } });
    expect(rem.ok()).toBeTruthy();
    expect((await rem.json()).removed).toBe(true);
  });

  test('lan endpoints return host arrays', async ({ page }) => {
    const lan = await page.request.get('/api/lan');
    expect(lan.ok()).toBeTruthy();
    expect(Array.isArray((await lan.json()).hosts)).toBe(true);

    const scan = await page.request.post('/api/lan/scan', {});
    expect(scan.ok()).toBeTruthy();
    expect(Array.isArray((await scan.json()).hosts)).toBe(true);
  });

  test('system monitor shows local host and added endpoint card', async ({ page }) => {
    const ip = TEST_IPS[1];
    await page.getByRole('button', { name: 'SYS MON' }).click();
    await expect(page.getByText('LOCAL HOST').first()).toBeVisible();
    await expect(page.getByText(/MONITORING \d+ ENDPOINTS/).first()).toBeVisible();

    await page.fill('#remote-ip-input', ip);
    await page.fill('#remote-label-input', `mon-${ip}`);
    await page.getByRole('button', { name: 'ADD', exact: true }).click();

    const card = page.locator('div').filter({ hasText: `mon-${ip}` }).last();
    await expect(card).toBeVisible();

    const entry = await page.request.get('/api/endpoints');
    const found = (await entry.json()).endpoints.find(e => e.ip === ip);
    expect(found).toBeTruthy();
    await removeIfNeeded(page, ip);
  });

  test('service discovery lists endpoints as target pills', async ({ page }) => {
    const ip = TEST_IPS[2];
    await page.request.post('/api/endpoints', { data: { action: 'add', ip, label: 'svc-box' } });
    await page.getByRole('button', { name: 'SVCS' }).click();

    await expect(page.getByText('TARGET').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'LOCAL HOST' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'svc-box' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'svc-box' }).click();
    await expect(page.getByText('LISTENING PORTS').first()).toBeVisible();
    await removeIfNeeded(page, ip);
  });
});

test.describe('Voice commands', () => {
  test('intent endpoint resolves commands and falls back on unknown', async ({ page }) => {
    const ok = await page.request.post('/api/voice/intent', {
      data: { text: 'status of ray', source: 'console' },
    });
    expect(ok.ok()).toBeTruthy();
    const known = await ok.json();
    expect(known.heard).toBe(true);
    expect(known.intent).toBe('host_status');
    expect(known.reply).toContain('ray');

    const bad = await page.request.post('/api/voice/intent', {
      data: { text: 'banana giraffe' },
    });
    const unknown = await bad.json();
    expect(unknown.heard).toBe(false);
    expect(unknown.reply).toContain("didn't catch");
  });

  test('voice console sends a command and shows the reply', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const input = page.getByPlaceholder(/say:/);
    await input.fill('open services');
    await page.getByRole('button', { name: 'SEND', exact: true }).click();

    await expect(page.getByText('Opening service discovery.')).toBeVisible();
    await expect(page.getByText('REPLY').first()).toBeVisible();
  });
});

test.describe('Watchdog & thermal', () => {
  test('voice status endpoint exposes liveness', async ({ page }) => {
    const res = await page.request.get('/api/voice/status');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(typeof data.alive).toBe('boolean');
    expect(typeof data.stale).toBe('boolean');
    expect(typeof data.state).toBe('string');
  });

  test('system endpoint includes thermal telemetry shape', async ({ page }) => {
    const res = await page.request.get('/api/system');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data).toHaveProperty('thermal');
    expect(data.thermal).toHaveProperty('temp_c');
    expect(data.thermal).toHaveProperty('throttled');
    expect(data.thermal).toHaveProperty('flags');
  });

  test('endpoint views include thermal field', async ({ page }) => {
    const res = await page.request.get('/api/endpoints');
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.endpoints)).toBe(true);
    for (const e of data.endpoints) {
      expect(e).toHaveProperty('thermal');
    }
  });
});
