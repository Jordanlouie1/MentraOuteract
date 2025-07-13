import { AppServer, AppSession, ViewType, AuthenticatedRequest, PhotoData } from '@mentra/sdk';
import { Request, Response } from 'express';
import * as ejs from 'ejs';
import * as path from 'path';

/**
 * Interface representing a stored photo with metadata
 */
interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
  audioBuffer?: Buffer;
}

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');
const BASE_URL = process.env.PUBLIC_BASE_URL ?? 'https://your-ngrok-or-domain.com'; // <-- Set your public ngrok or prod domain here

class ExampleMentraOSApp extends AppServer {
  private photos: Map<string, StoredPhoto> = new Map();
  private latestPhotoTimestamp: Map<string, number> = new Map();
  private isStreamingPhotos: Map<string, boolean> = new Map();
  private nextPhotoTime: Map<string, number> = new Map();
  private sessions: Map <string, AppSession> = new Map();

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    this.setupWebviewRoutes();
  }

  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    this.logger.info(`Session started for user ${userId}`);
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.set(userId, Date.now());
    this.sessions.set(userId, session);

    // session.audio.speak("Hello world");

    session.events.onButtonPress(async (button) => {
      this.logger.info(`Button pressed: ${button.buttonId}, type: ${button.pressType}`);

      if (button.pressType === 'long') {
        this.isStreamingPhotos.set(userId, !this.isStreamingPhotos.get(userId));
        this.logger.info(`Streaming photos for user ${userId} is now ${this.isStreamingPhotos.get(userId)}`);
        return;
      } else {
        session.layouts.showTextWall("Button pressed, about to take photo", { durationMs: 4000 });
        try {
          const photo = await session.camera.requestPhoto();
          this.logger.info(`Photo taken for user ${userId}, timestamp: ${photo.timestamp}`);
          this.cachePhoto(photo, userId, session);
        } catch (error) {
          this.logger.error(`Error taking photo: ${error}`);
        }
      }
    });

    setInterval(async () => {
      if (this.isStreamingPhotos.get(userId) && Date.now() > (this.nextPhotoTime.get(userId) ?? 0)) {
        try {
          this.nextPhotoTime.set(userId, Date.now() + 30000);
          const photo = await session.camera.requestPhoto();
          this.nextPhotoTime.set(userId, Date.now());
          this.cachePhoto(photo, userId, session);
        } catch (error) {
          this.logger.error(`Error auto-taking photo: ${error}`);
        }
      }
    }, 1000);
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.delete(userId);
    this.logger.info(`Session stopped for user ${userId}, reason: ${reason}`);
  }

  private async cachePhoto(photo: PhotoData, userId: string, session: AppSession) {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');

    const cachedPhoto: StoredPhoto = {
      requestId: photo.requestId,
      buffer: photo.buffer,
      timestamp: photo.timestamp,
      userId: userId,
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size
    };

    this.photos.set(userId, cachedPhoto);
    this.latestPhotoTimestamp.set(userId, cachedPhoto.timestamp.getTime());
    this.logger.info(`Photo cached for user ${userId}, timestamp: ${cachedPhoto.timestamp}`);

    try {
      const outputDir = path.join(process.cwd(), 'tmp');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir);
      }

      const imagePath = path.join(outputDir, photo.filename);
      fs.writeFileSync(imagePath, photo.buffer);
      this.logger.info(`Photo saved to disk at ${imagePath}`);

      const pythonPath = 'python3';
      const scriptPath = path.join('src', 'sign_recognition', 'call.py');

      exec(`${pythonPath} ${scriptPath} "${imagePath}"`, async (error: any, stdout: any, stderr: any) => {
        if (error) {
          this.logger.error(`Python error: ${error.message}`);
          return;
        }
        if (stderr) {
          this.logger.error(`Python stderr: ${stderr}`);
          return;
        }

        this.logger.info(`Python output:\n${stdout}`);

        try {
          const filenameWithoutExt = path.parse(photo.filename).name;
          const mp3Path = path.join(process.cwd(), 'output', `${filenameWithoutExt}_result.mp3`);

          if (!fs.existsSync(mp3Path)) {
            this.logger.error(`Audio file not found at ${mp3Path}`);
            return;
          }

          const photoEntry = this.photos.get(userId);
          if (photoEntry && photoEntry.requestId === photo.requestId) {
            photoEntry.audioBuffer = fs.readFileSync(mp3Path); // Optional: still storing buffer
          }

          const audioUrl = `${BASE_URL}/static/audio/${filenameWithoutExt}_result.mp3`;
          await session.audio.playAudio({ audioUrl: audioUrl });

          this.logger.info(`✅ Audio played from ${audioUrl}`);
        } catch (err) {
          this.logger.error(`Error playing MP3: ${err}`);
        }
      });
    } catch (err) {
      this.logger.error(`Error in cachePhoto: ${err}`);
    }
  }

  private setupWebviewRoutes(): void {
    const app = this.getExpressApp();

    app.get('/api/latest-photo', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId ?? 'sjswee31@gmail.com';
      const photo = this.photos.get(userId);
      if (!photo) return res.status(404).json({ error: 'No photo available' });
      res.json({
        requestId: photo.requestId,
        timestamp: photo.timestamp.getTime(),
        hasPhoto: true
      });
    });

    app.get('/api/photo/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId ?? 'sjswee31@gmail.com';
      const requestId = req.params.requestId;
      const photo = this.photos.get(userId);
      if (!photo || photo.requestId !== requestId) return res.status(404).json({ error: 'Photo not found' });
      res.set({ 'Content-Type': photo.mimeType, 'Cache-Control': 'no-cache' });
      res.send(photo.buffer);
    });

    app.get('/api/audio/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId ?? 'sjswee31@gmail.com';
      const requestId = req.params.requestId;
      const photo = this.photos.get(userId);
      if (!photo || photo.requestId !== requestId || !photo.audioBuffer) {
        return res.status(404).json({ error: 'Audio not found' });
      }
      res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' });
      res.send(photo.audioBuffer);
    });

    // ✅ NEW: Serve MP3 files by URL
    app.post('/api/play-text', async (req: any, res: any) => {
      try {

        const {text, userId} = req.body;
        if (!text || !userId) {
          console.error("Must specify text or userId");
          return res.status(400).send("Must specify text or userId");
        }
        const session: AppSession | undefined = this.sessions.get(userId);
        if (!session) {
          return res.status(500).send("No user session found");
        }
        await session.audio.speak(text);
      }
      catch(error: any) {
        console.log(error);
        return res.status(500).sendJson({error});
      }
    });

    app.get('/webview', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId ?? 'sjswee31@gmail.com';
      if (!userId) {
        return res.status(401).send(`
          <html>
            <head><title>Photo Viewer - Not Authenticated</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Please open this page from the MentraOS app</h1>
            </body>
          </html>
        `);
      }

      const templatePath = path.join(process.cwd(), 'views', 'photo-viewer.ejs');
      const html = await ejs.renderFile(templatePath, {});
      res.send(html);
    });
  }
}

const app = new ExampleMentraOSApp();
app.start().catch(console.error);
