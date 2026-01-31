import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 60 // 1 minute for logo upload

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
    const file = formData.get('logo') as File
    
    if (!file) {
      return NextResponse.json(
        { error: 'No logo file provided' },
        { status: 400 }
      )
    }
    
    // Validate file type - only PNG
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload PNG files only for logo.' },
        { status: 400 }
      )
    }
    
    // Generate unique filename
    const timestamp = Date.now()
    const filename = `logo_${timestamp}.png`
    const filepath = path.join(CACHE_DIR, filename)
    
    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    
    await writeFile(filepath, buffer)
    
    return NextResponse.json({
      success: true,
      message: 'Logo uploaded successfully',
      logoPath: filepath,
      filename
    })
  } catch (error: any) {
    console.error('Error uploading logo:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload logo' },
      { status: 500 }
    )
  }
}
