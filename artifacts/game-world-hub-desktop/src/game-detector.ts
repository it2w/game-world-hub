/**
 * Game Detector — scans running Windows processes to identify active games,
 * then reports the current game to the renderer and tray.
 *
 * Uses PowerShell `Get-Process` for low-overhead process enumeration.
 * Works only on Windows; no-ops on other platforms.
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import { BrowserWindow } from 'electron';
import { GAME_SCAN_INTERVAL_MS } from './constants';

const execAsync = promisify(exec);

export interface DetectedGame {
  name: string;
  processName: string;
  genre: string;
}

/** Map from lower-cased process name to game info */
const KNOWN_GAMES: Record<string, Omit<DetectedGame, 'processName'>> = {
  // MOBA
  'league of legends.exe':        { name: 'League of Legends',       genre: 'MOBA' },
  'leagueclient.exe':             { name: 'League of Legends',        genre: 'MOBA' },
  'dota2.exe':                    { name: 'Dota 2',                   genre: 'MOBA' },
  'heroesofthestorm.exe':         { name: 'Heroes of the Storm',      genre: 'MOBA' },
  // FPS / Tactical
  'cs2.exe':                      { name: 'Counter-Strike 2',         genre: 'FPS' },
  'csgo.exe':                     { name: 'CS:GO',                    genre: 'FPS' },
  'valorant-win64-shipping.exe':  { name: 'VALORANT',                 genre: 'FPS' },
  'valorant.exe':                 { name: 'VALORANT',                 genre: 'FPS' },
  'rainbowsix.exe':               { name: 'Rainbow Six Siege',        genre: 'FPS' },
  'r5apex.exe':                   { name: 'Apex Legends',             genre: 'FPS' },
  'overwatch.exe':                { name: 'Overwatch 2',              genre: 'FPS' },
  'modernwarfare.exe':            { name: 'Call of Duty: MW',         genre: 'FPS' },
  'warzone.exe':                  { name: 'Warzone',                  genre: 'FPS' },
  'cod.exe':                      { name: 'Call of Duty',             genre: 'FPS' },
  'battlefieldbadcompany2.exe':   { name: 'Battlefield',              genre: 'FPS' },
  'bf1.exe':                      { name: 'Battlefield 1',            genre: 'FPS' },
  'bf2042.exe':                   { name: 'Battlefield 2042',         genre: 'FPS' },
  'destiny2.exe':                 { name: 'Destiny 2',                genre: 'FPS' },
  'paladins.exe':                 { name: 'Paladins',                 genre: 'FPS' },
  // Battle Royale
  'fortniteclient-win64-shipping.exe': { name: 'Fortnite',            genre: 'Battle Royale' },
  'tslgame.exe':                  { name: 'PUBG',                     genre: 'Battle Royale' },
  'fallguys_client_game.exe':     { name: 'Fall Guys',                genre: 'Battle Royale' },
  // RPG / Open World
  'gta5.exe':                     { name: 'GTA V',                    genre: 'Open World' },
  'rdr2.exe':                     { name: 'Red Dead Redemption 2',    genre: 'Open World' },
  'eldenring.exe':                { name: 'Elden Ring',               genre: 'RPG' },
  'witcher3.exe':                 { name: 'The Witcher 3',            genre: 'RPG' },
  'pathofexile.exe':              { name: 'Path of Exile',            genre: 'RPG' },
  'diablo iv.exe':                { name: 'Diablo IV',                genre: 'RPG' },
  'diablo4.exe':                  { name: 'Diablo IV',                genre: 'RPG' },
  'cyberpunk2077.exe':            { name: 'Cyberpunk 2077',           genre: 'RPG' },
  // Survival / Sandbox
  'rustclient.exe':               { name: 'Rust',                     genre: 'Survival' },
  'shootergame.exe':              { name: 'ARK: Survival',            genre: 'Survival' },
  'minecraft.exe':                { name: 'Minecraft',                genre: 'Sandbox' },
  'javaw.exe':                    { name: 'Minecraft (Java)',          genre: 'Sandbox' },
  'valheim.exe':                  { name: 'Valheim',                   genre: 'Survival' },
  // Sports / Racing
  'fifasetup.exe':                { name: 'EA Sports FC',             genre: 'Sports' },
  'fc25.exe':                     { name: 'EA Sports FC 25',          genre: 'Sports' },
  'rocketleague.exe':             { name: 'Rocket League',            genre: 'Sports' },
  // Strategy / Other
  'stellaris.exe':                { name: 'Stellaris',                genre: 'Strategy' },
  'hoi4.exe':                     { name: 'Hearts of Iron IV',        genre: 'Strategy' },
  'civilizationvi.exe':           { name: 'Civilization VI',          genre: 'Strategy' },
  // Platforms (detect that gaming is happening)
  'steam.exe':                    { name: 'Steam',                    genre: 'Platform' },
  'epicgameslauncher.exe':        { name: 'Epic Games',               genre: 'Platform' },
  'robloxplayerbeta.exe':         { name: 'Roblox',                   genre: 'Sandbox' },
};

type GameChangeHandler = (game: DetectedGame | null) => void;

export class GameDetector {
  private mainWindow: BrowserWindow;
  private currentGame: DetectedGame | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onGameChange: GameChangeHandler;

  constructor(mainWindow: BrowserWindow, onGameChange: GameChangeHandler) {
    this.mainWindow = mainWindow;
    this.onGameChange = onGameChange;
  }

  start(): void {
    if (process.platform !== 'win32') return; // Windows only
    this.scan();
    this.intervalId = setInterval(() => this.scan(), GAME_SCAN_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  getCurrentGame(): DetectedGame | null {
    return this.currentGame;
  }

  private async scan(): Promise<void> {
    try {
      // Get running process names via PowerShell (fast, lightweight)
      const { stdout } = await execAsync(
        'powershell -NoProfile -NonInteractive -Command "Get-Process | Select-Object -ExpandProperty Name"',
        { timeout: 8_000 },
      );

      const running = new Set(
        stdout.split(/\r?\n/).map(l => l.trim().toLowerCase() + '.exe'),
      );

      let detected: DetectedGame | null = null;
      for (const [procName, info] of Object.entries(KNOWN_GAMES)) {
        if (running.has(procName)) {
          // Prefer a real game over just a launcher platform
          if (info.genre !== 'Platform' || !detected) {
            detected = { ...info, processName: procName };
          }
          if (info.genre !== 'Platform') break; // Prefer actual game match
        }
      }

      if (detected?.name !== this.currentGame?.name) {
        this.currentGame = detected;
        this.onGameChange(detected);

        if (!this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('game-change', detected);
        }

        console.log(
          detected
            ? `[game-detector] Now playing: ${detected.name}`
            : '[game-detector] No game detected',
        );
      }
    } catch (err) {
      // Silently suppress — PowerShell may not be available or may timeout
      console.debug('[game-detector] scan error:', (err as Error).message);
    }
  }
}
