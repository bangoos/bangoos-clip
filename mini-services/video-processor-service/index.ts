import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { spawn } from 'child_process'
import { writeFile, readFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = 3002
const httpServer = createServer()
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

// Ensure output directory exists
const OUTPUT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'KlipPod_Output')
const CACHE_DIR = path.join(__dirname, 'cache')

async function ensureDirectories() {
  for (const dir of [OUTPUT_DIR, CACHE_DIR]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true })
      console.log(`Created directory: ${dir}`)
    }
  }
}

// Process video with FFMPEG
async function processVideo(
  videoPath: string,
  clips: any[],
  facecamSettings: any,
  gameplaySettings: any,
  watermark: string,
  logoPath?: string,
  socket?: any
) {
  const results: string[] = []

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    const outputPath = path.join(OUTPUT_DIR, `${clip.name.replace(/\s+/g, '_')}.mp4`)

    try {
      await processClip(videoPath, clip, facecamSettings, gameplaySettings, watermark, logoPath, outputPath, socket, i, clips.length)
      results.push(outputPath)
      
      if (socket) {
        socket.emit('progress', {
          clipId: clip.id,
          clipName: clip.name,
          progress: ((i + 1) / clips.length) * 100,
          status: 'completed',
          outputPath
        })
      }
    } catch (error: any) {
      console.error(`Error processing clip ${clip.name}:`, error)
      
      if (socket) {
        socket.emit('progress', {
          clipId: clip.id,
          clipName: clip.name,
          progress: ((i + 1) / clips.length) * 100,
          status: 'error',
          error: error.message
        })
      }
      throw error
    }
  }

  return results
}

async function processClip(
  videoPath: string,
  clip: any,
  facecamSettings: any,
  gameplaySettings: any,
  watermark: string,
  logoPath: string | undefined,
  outputPath: string,
  socket: any,
  clipIndex: number,
  totalClips: number
) {
  return new Promise((resolve, reject) => {
    const outputWidth = 1080
    const outputHeight = 1920
    
    const facecamHeight = Math.floor((facecamSettings.height / 100) * outputHeight)
    const gameplayHeight = Math.floor((gameplaySettings.height / 100) * outputHeight)
    
    // Calculate crop parameters - use source video dimensions as base
    const facecamZoom = facecamSettings.zoom / 100
    const gameplayZoom = gameplaySettings.zoom / 100
    
    // Build complex FFMPEG filter
    let filterComplex = []
    
    // First scale the video to output width, maintain aspect ratio
    filterComplex.push(`[0:v]scale=${outputWidth}:-2,pad=${outputWidth}:${outputHeight}:(ow-iw)/2:(oh-ih)/2[v_full]`)
    
    // Now split the scaled video
    filterComplex.push('[v_full]split=2[facecam_src][gameplay_src]')
    
    // Facecam processing - crop from the facecam portion of the scaled video
    const facecamCropWidth = Math.floor(outputWidth / facecamZoom)
    const facecamCropHeight = Math.floor(facecamHeight / facecamZoom)
    // Calculate crop position based on pan settings
    const facecamX = Math.floor((outputWidth - facecamCropWidth) / 2 + facecamSettings.panX * 5)
    const facecamY = Math.floor((facecamHeight - facecamCropHeight) / 2 + facecamSettings.panY * 5)
    
    // Ensure crop dimensions are valid
    const validFacecamWidth = Math.max(1, Math.min(facecamCropWidth, outputWidth))
    const validFacecamHeight = Math.max(1, Math.min(facecamCropHeight, facecamHeight))
    const validFacecamX = Math.max(0, Math.min(facecamX, outputWidth - validFacecamWidth))
    const validFacecamY = Math.max(0, Math.min(facecamY, facecamHeight - validFacecamHeight))
    
    filterComplex.push(
      `[facecam_src]` +
      `crop=${validFacecamWidth}:${validFacecamHeight}:${validFacecamX}:${validFacecamY},` +
      `scale=${outputWidth}:${facecamHeight},` +
      `setsar=1:1[facecam]`
    )
    
    // Gameplay processing - crop from the gameplay portion
    const gameplayCropWidth = Math.floor(outputWidth / gameplayZoom)
    const gameplayCropHeight = Math.floor(gameplayHeight / gameplayZoom)
    // Calculate crop position based on pan settings (offset from top of gameplay area)
    const gameplayX = Math.floor((outputWidth - gameplayCropWidth) / 2 + gameplaySettings.panX * 5)
    const gameplayY = Math.floor((facecamHeight - gameplayCropHeight) / 2 + gameplaySettings.panY * 5)
    
    // Ensure crop dimensions are valid
    const validGameplayWidth = Math.max(1, Math.min(gameplayCropWidth, outputWidth))
    const validGameplayHeight = Math.max(1, Math.min(gameplayCropHeight, outputHeight))
    const validGameplayX = Math.max(0, Math.min(gameplayX, outputWidth - validGameplayWidth))
    const validGameplayY = Math.max(0, Math.min(gameplayY, outputHeight - validGameplayHeight))
    
    filterComplex.push(
      `[gameplay_src]` +
      `crop=${validGameplayWidth}:${validGameplayHeight}:${validGameplayX}:${validGameplayY},` +
      `scale=${outputWidth}:${gameplayHeight},` +
      `setsar=1:1[gameplay]`
    )
    
    // Stack facecam and gameplay
    filterComplex.push(`[facecam][gameplay]vstack[video_out]`)
    
    // Add watermark text if provided
    if (watermark) {
      filterComplex.push(
        `[video_out]` +
        `drawtext=text='${watermark}':` +
        `x=w-tw-10:y=h-th-10:` +
        `fontsize=24:fontcolor=white@0.8:` +
        `shadowx=2:shadowy=2:shadowcolor=black@0.5[video_watermarked]`
      )
    }
    
    const ffmpegArgs = [
      '-i', videoPath,
      '-ss', clip.startTime,
      '-to', clip.endTime,
      '-filter_complex', filterComplex.join(';'),
      '-map', watermark || logoPath ? '[video_watermarked]' : '[video_out]',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-y',
      outputPath
    ]
    
    console.log('FFMPEG command:', ffmpegArgs.join(' '))
    
    const ffmpeg = spawn('ffmpeg', ffmpegArgs)
    
    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString()
      
      // Parse progress from FFMPEG output
      const timeMatch = message.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
      if (timeMatch) {
        const currentTime = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3])
        
        // Calculate clip duration
        const startParts = clip.startTime.split(':').map(Number)
        const endParts = clip.endTime.split(':').map(Number)
        const duration = (endParts[0] * 3600 + endParts[1] * 60 + endParts[2]) - 
                        (startParts[0] * 3600 + startParts[1] * 60 + startParts[2])
        
        const clipProgress = Math.min((currentTime / duration) * 100, 100)
        const totalProgress = (clipIndex / totalClips) * 100 + (clipProgress / totalClips)
        
        if (socket) {
          socket.emit('progress', {
            clipId: clip.id,
            clipName: clip.name,
            progress: totalProgress,
            status: 'processing',
            currentTime: message.match(/time=\S+/)?.[0]
          })
        }
      }
      
      // Log FFMPEG output
      if (socket) {
        socket.emit('log', message.trim())
      }
    })
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        console.log(`Successfully processed clip: ${clip.name}`)
        resolve(outputPath)
      } else {
        reject(new Error(`FFMPEG exited with code ${code}`))
      }
    })
    
    ffmpeg.on('error', (error) => {
      console.error('FFMPEG error:', error)
      reject(error)
    })
  })
}

// Download YouTube video using yt-dlp
async function downloadYouTubeVideo(url: string, socket?: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(CACHE_DIR, `youtube_${Date.now()}.mp4`)
    
    // Use yt-dlp from common locations
    const homeDir = process.env.HOME || process.env.USERPROFILE
    const ytDlpPaths = [
      path.join(homeDir, '.local', 'bin', 'yt-dlp'),
      '/usr/local/bin/yt-dlp',
      '/usr/bin/yt-dlp',
      'yt-dlp'
    ]
    
    // Use the first path that exists, fall back to system path
    let ytDlpCommand = 'yt-dlp'
    for (const ytdlpPath of ytDlpPaths) {
      if (existsSync(ytdlpPath)) {
        ytDlpCommand = ytdlpPath
        console.log(`Using yt-dlp from: ${ytDlpPath}`)
        break
      }
    }
    
    const ytdlp = spawn(ytDlpCommand, [
      '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      '-o', outputPath,
      '--merge-output-format', 'mp4',
      url
    ])
    
    ytdlp.stderr.on('data', (data) => {
      const message = data.toString()
      
      // Extract download progress
      const downloadMatch = message.match(/(\d+\.?\d*)%/)
      if (downloadMatch && socket) {
        socket.emit('download-progress', {
          progress: parseFloat(downloadMatch[1])
        })
      }
      
      // Log yt-dlp output
      if (socket) {
        socket.emit('log', message.trim())
      }
    })
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        console.log('YouTube video downloaded successfully')
        resolve(outputPath)
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`))
      }
    })
    
    ytdlp.on('error', (error) => {
      console.error('yt-dlp error:', error)
      reject(error)
    })
  })
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)
  
  socket.on('process-video', async (data) => {
    const { 
      videoPath, 
      clips, 
      facecamSettings, 
      gameplaySettings, 
      watermark, 
      logoPath 
    } = data
    
    console.log('Processing video request received')
    console.log('Clips:', clips.length)
    console.log('Facecam settings:', facecamSettings)
    console.log('Gameplay settings:', gameplaySettings)
    
    try {
      await ensureDirectories()
      
      const results = await processVideo(
        videoPath,
        clips,
        facecamSettings,
        gameplaySettings,
        watermark,
        logoPath,
        socket
      )
      
      socket.emit('process-complete', {
        success: true,
        results,
        message: `Successfully processed ${clips.length} clip(s)`
      })
    } catch (error: any) {
      console.error('Error processing video:', error)
      socket.emit('process-complete', {
        success: false,
        error: error.message
      })
    }
  })
  
  socket.on('download-youtube', async (data) => {
    const { url } = data
    
    console.log('YouTube download request received:', url)
    
    try {
      await ensureDirectories()
      
      const videoPath = await downloadYouTubeVideo(url, socket)
      
      socket.emit('download-complete', {
        success: true,
        videoPath,
        message: 'YouTube video downloaded successfully'
      })
    } catch (error: any) {
      console.error('Error downloading YouTube video:', error)
      socket.emit('download-complete', {
        success: false,
        error: error.message
      })
    }
  })
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

// Start server
httpServer.listen(PORT, () => {
  console.log(`Video processor service running on port ${PORT}`)
  console.log(`Output directory: ${OUTPUT_DIR}`)
  console.log(`Cache directory: ${CACHE_DIR}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully...')
  httpServer.close(() => {
    process.exit(0)
  })
})
