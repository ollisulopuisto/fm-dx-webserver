const http = require('http');
const { spawn } = require('child_process');
const { serverConfig } = require('../server_config');
const { logDebug, logError, logInfo, logWarn, logFfmpeg } = require('../console');
const checkFFmpeg = require('./checkFFmpeg');

const consoleLogTitle = '[Denon Stream]';

function getFFmpegInputArgs() {
    const inputDevice = serverConfig.audio.audioDevice || 'Stereo Mix';
    const baseFlags = ['-fflags', '+nobuffer+flush_packets', '-flags', 'low_delay', '-rtbufsize', '6192', '-probesize', '32'];

    if (process.platform === 'win32') {
        return [
            ...baseFlags,
            '-f', 'dshow',
            '-audio_buffer_size', '200',
            '-i', `audio=${inputDevice}`
        ];
    } else if (process.platform === 'darwin') {
        const device = serverConfig.audio.audioDevice;
        return [
            ...baseFlags,
            '-f', 'avfoundation',
            '-i', `${device || ':0'}`
        ];
    } else { // Linux
        const device = serverConfig.audio.audioDevice;
        return [
            ...baseFlags,
            '-f', 'alsa',
            '-i', `${device}`
        ];
    }
}

function startDenonStream() {
    if (!serverConfig.audio.denonStream || !serverConfig.audio.denonStream.enabled) {
        return;
    }

    checkFFmpeg().then((ffmpegPath) => {
        const port = serverConfig.audio.denonStream.port || 8081;

        const server = http.createServer((req, res) => {
            logInfo(`${consoleLogTitle} Client connected.`);

            const inputArgs = getFFmpegInputArgs();
            const ffmpegArgs = [
                ...inputArgs,
                '-acodec', 'libmp3lame',
                '-b:a', serverConfig.audio.audioBitrate || '128k',
                '-ac', serverConfig.audio.audioChannels || 2,
                '-ar', '48000',
                '-f', 'mp3',
                'pipe:1'
            ];

            logDebug(`${consoleLogTitle} Launching FFmpeg with args: ${ffmpegArgs.join(' ')}`);
            const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Connection': 'keep-alive'
            });

            ffmpeg.stdout.pipe(res);

            ffmpeg.stderr.on('data', (data) => {
                logFfmpeg(`[FFmpeg stderr]: ${data}`);
            });

            req.on('close', () => {
                logInfo(`${consoleLogTitle} Client disconnected.`);
                ffmpeg.kill('SIGKILL');
            });
        });

        server.listen(port, () => {
            logInfo(`${consoleLogTitle} MP3 stream listening on http://localhost:${port}`);
        });

    }).catch((err) => {
        logError(`${consoleLogTitle} Error: ${err.message}`);
    });
}

module.exports = { startDenonStream };
