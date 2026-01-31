import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const OUTPUT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'KlipPod_Output')

export async function GET(request: NextRequest) {
  try {
    if (!existsSync(OUTPUT_DIR)) {
      return NextResponse.json({
        success: true,
        videos: [],
        message: 'Output directory does not exist yet'
      })
    }
    
    const files = await readdir(OUTPUT_DIR)
    const videoFiles = files.filter(file => file.endsWith('.mp4'))
    
    const videos = await Promise.all(
      videoFiles.map(async (filename) => {
        const filepath = path.join(OUTPUT_DIR, filename)
        const stats = await stat(filepath)
        
        return {
          filename,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          downloadUrl: `/api/download-video?filename=${encodeURIComponent(filename)}`
        }
      })
    )
    
    // Sort by creation date, newest first
    videos.sort((a, b) => b.created.getTime() - a.created.getTime())
    
    return NextResponse.json({
      success: true,
      videos,
      count: videos.length
    })
  } catch (error: any) {
    console.error('Error listing videos:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to list videos' },
      { status: 500 }
    )
  }
}
