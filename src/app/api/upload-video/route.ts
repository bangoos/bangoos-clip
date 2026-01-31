import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 minutes for upload

const CACHE_DIR = path.join(process.cwd(), 'mini-services', 'video-processor-service', 'cache')

async function ensureCacheDir() {
  if (!existsSync(CACHE_DIR)) {
    await mkdir(CACHE_DIR, { recursive: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureCacheDir()
    
    const formData = await request.formData()
    const file = formData.get('video') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No video file provided' },
        { status: 400 }
      )
    }
    
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/x-matroska', 'video/quicktime', 'video/x-msvideo']
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(mp4|mkv|mov|avi)$/i)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload MP4, MKV, MOV, or AVI files.' },
        { status: 400 }
      )
    }
    
    // Generate unique filename
    const timestamp = Date.now()
    const extension = path.extname(file.name)
    const filename = `video_${timestamp}${extension}`
    const filepath = path.join(CACHE_DIR, filename)
    
    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    await writeFile(filepath, buffer)
    
    return NextResponse.json({
      success: true,
      message: 'Video uploaded successfully',
      videoPath: filepath,
      filename
    })
  } catch (error: any) {
    console.error('Error uploading video:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload video' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Video upload endpoint is ready',
    maxFileSize: '500MB'
  })
}
