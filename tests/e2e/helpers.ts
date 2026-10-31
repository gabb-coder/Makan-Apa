import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Browser, type Page } from '@playwright/test';

/** Public client config from the committed .env (the publishable key is meant for browsers). */
export function supabaseConfig() {
  const env = Object.fromEntries(
    readFileSync('.env', 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => l.split('=').map((s) => s.trim()) as [string, string]),
  );
  return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY };
}

/** A Supabase client with no session: what anyone on the internet has. */
export function publicClient(): SupabaseClient {
  const { url, key } = supabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** A fresh anonymous account, like a new phone. */
export async function signedInClient(): Promise<SupabaseClient> {
  const db = publicClient();
  const { error } = await db.auth.signInAnonymously();
  if (error) throw new Error(`Anonymous sign-in failed: ${error.message}`);
  return db;
}

export async function newPhone(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/** Creates a room in the app (optionally named) and returns its code. */
export async function createRoom(page: Page, name: string, roomName = ''): Promise<string> {
  await page.goto('/');
  await page.fill('#join-name', name);
  await page.click('text=Create a new room'); // reveals the optional room name
  if (roomName) await page.fill('#room-name', roomName);
  await page.click('button:text-is("Create room")');
  // The room chip on Today: "<room name or Room CODE>, code CODE: …".
  const chip = page.locator('button[aria-label*=", code "]');
  await expect(chip).toBeVisible();
  return (await chip.getAttribute('aria-label'))!.match(/code ([A-Z0-9]{6})/)![1];
}

export async function joinRoom(page: Page, code: string, name: string): Promise<void> {
  await page.goto(`/?join=${code}`);
  await expect(page.locator('#join-code')).toHaveValue(code);
  await page.fill('#join-name', name);
  await page.click('button:text-is("Join room")');
  await expect(page.locator('nav')).toBeVisible();
}

/** Host only: delete the room from Settings. With no other room on the phone, it shows Join. */
export async function deleteRoom(page: Page, lastRoom = true): Promise<void> {
  await page.goto('/#settings');
  await page.click('text=Delete this room for everyone');
  await page.click('text=Tap again to delete everything');
  if (lastRoom) await expect(page.locator('#join-name')).toBeVisible();
}
