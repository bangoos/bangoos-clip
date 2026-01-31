import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

const OUTPUT_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '.', 'Downloads', 'KlipPod_Output')

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const filename = searchParams.get('filename')
    
    if (!filename) {
      return NextResponse.json(
        { error: 'Filename parameter is required' },
        { status: 400 }
      )
    }
    
    // Sanitize filename to prevent directory traversal
    const sanitizedFilename = path.basename(filename)
    const filepath = path.join(OUTPUT_DIR, sanitizedFilename)
    
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }
    
    // Read file
    const fileBuffer = await readFile(filepath)
    
    // Return file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename="${sanitizedFilename}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    })
  } catch (error: any) {
    console.error('Error downloading video:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to download video' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json()
    
    if (!filename) {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      )
    }
    
    // Sanitize filename
    const sanitizedFilename = path.basename(filename)
    const filepath = path.join(OUTPUT_DIR, sanitizedFilename)
    
    if (!existsSync(filepath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      )
    }
    
    // Generate download URL
    const downloadUrl = `/api/download-video?filename=${encodeURIComponent(sanitizedFilename)}`
    
    return NextResponse.json({
      success: true,
      downloadUrl,
      filename: sanitizedFilename
    })
  } catch (error: any) {
    console.error('Error generating download link:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate download link' },
      { status: 500 }
    )
  }
}
