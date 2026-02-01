'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useTheme } from 'next-themes'
import {
  Upload,
  Youtube,
  Play,
  Pause,
  Trash2,
  Plus,
  Settings,
  Video,
  Download,
  Move,
  ZoomIn,
  Type,
  Image as ImageIcon,
  Terminal,
  CheckCircle2,
  Moon,
  Sun
} from 'lucide-react'

interface Clip {
  id: string
  name: string
  startTime: string
  endTime: string
}

interface FacecamSettings {
  height: number
  zoom: number
  panX: number
  panY: number
}

interface GameplaySettings {
  height: number
  zoom: number
  panX: number
  panY: number
}

interface ProcessedVideo {
  filename: string
  size: number
  created: Date
  modified: Date
  downloadUrl: string
}

export default function VideoClipper() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const clipCounterRef = useRef(0)

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [videoPath, setVideoPath] = useState<string>('')
  const [youtubeUrl, setYoutubeUrl] = useState<string>('')
  const [clips, setClips] = useState<Clip[]>([])
  const [currentClipId, setCurrentClipId] = useState<string | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [processedVideos, setProcessedVideos] = useState<ProcessedVideo[]>([])
  const [splitEnabled, setSplitEnabled] = useState<boolean>(true)
  const [facecamSettings, setFacecamSettings] = useState<FacecamSettings>({
    height: 40,
    zoom: 100,
    panX: 0,
    panY: 0
  })
  const [gameplaySettings, setGameplaySettings] = useState<GameplaySettings>({
    height: 60,
    zoom: 100,
    panX: 0,
    panY: 0
  })
  const [watermark, setWatermark] = useState<string>('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPath, setLogoPath] = useState<string>('')
  const [logs, setLogs] = useState<string[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [completedClips, setCompletedClips] = useState<string[]>([])
  const [socket, setSocket] = useState<Socket | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      addLog(`Uploading video file: ${file.name}...`)
      
      const formData = new FormData()
      formData.append('video', file)
      
      try {
        const response = await fetch('/api/upload-video', {
          method: 'POST',
          body: formData
        })
        
        const data = await response.json()
        
        if (data.success) {
          setVideoFile(file)
          setVideoUrl(URL.createObjectURL(file))
          setVideoPath(data.videoPath)
          addLog(`✓ Video uploaded successfully: ${data.filename}`)
        } else {
          addLog(`✗ Upload failed: ${data.error}`)
        }
      } catch (error) {
        addLog('✗ Error uploading video: Network error')
      }
    }
  }

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      addLog(`Uploading logo file: ${file.name}...`)
      
      const formData = new FormData()
      formData.append('logo', file)
      
      try {
        const response = await fetch('/api/upload-logo', {
          method: 'POST',
          body: formData
        })
        
        const data = await response.json()
        
        if (data.success) {
          setLogoFile(file)
          setLogoPath(data.logoPath)
          addLog(`✓ Logo uploaded successfully: ${data.filename}`)
        } else {
          addLog(`✗ Logo upload failed: ${data.error}`)
        }
      } catch (error) {
        addLog('✗ Error uploading logo: Network error')
      }
    }
  }

  const handleYoutubeUrl = () => {
    if (youtubeUrl && socketConnected) {
      addLog(`Starting YouTube download: ${youtubeUrl}`)
      addLog('Please wait while the video downloads...')
      
      socket?.emit('download-youtube', { url: youtubeUrl })
    } else if (!socketConnected) {
      addLog('✗ WebSocket not connected. Please wait...')
    }
  }

  const addClip = () => {
    const newClip: Clip = {
      id: `clip-${clipCounterRef.current++}`,
      name: `Clip ${clips.length + 1}`,
      startTime: '00:00:00',
      endTime: '00:00:10'
    }
    setClips([...clips, newClip])
    setCurrentClipId(newClip.id)
    addLog(`Added new clip: ${newClip.name}`)
  }

  const timeToSeconds = (timeStr: string): number => {
    const parts = timeStr.split(':').map(Number)
    return parts[0] * 3600 + parts[1] * 60 + parts[2]
  }

  const removeClip = (id: string) => {
    setClips(clips.filter(c => c.id !== id))
    if (currentClipId === id) {
      setCurrentClipId(clips[0]?.id || null)
    }
    addLog(`Removed clip: ${id}`)
  }

  const updateClip = (id: string, field: keyof Clip, value: string) => {
    setClips(clips.map(c => 
      c.id === id ? { ...c, [field]: value } : c
    ))
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  // Fetch processed videos list
  const fetchProcessedVideos = async () => {
    try {
      const response = await fetch('/api/list-videos')
      const data = await response.json()
      
      if (data.success) {
        setProcessedVideos(data.videos)
        addLog(`Found ${data.videos.length} processed video(s)`)
      }
    } catch (error) {
      console.error('Error fetching videos:', error)
    }
  }

  // Download processed video
  const handleDownload = async (filename: string) => {
    try {
      addLog(`Downloading: ${filename}...`)
      
      const response = await fetch(`/api/download-video?filename=${encodeURIComponent(filename)}`)
      
      if (!response.ok) {
        addLog(`✗ Download failed for ${filename}`)
        return
      }
      
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      
      addLog(`✓ Downloaded: ${filename}`)
    } catch (error) {
      addLog('✗ Error downloading video')
      console.error(error)
    }
  }

  // Format file size
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  // WebSocket connection
  useEffect(() => {
    // Set mounted to true after component mounts (prevents hydration mismatch)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)

    // Fetch processed videos on mount
    fetchProcessedVideos()

    const socketInstance = io('/?XTransformPort=3002', {
      transports: ['websocket', 'polling']
    })

    socketInstance.on('connect', () => {
      console.log('Connected to video processor service')
      setSocketConnected(true)
      addLog('✓ Connected to video processor service')
    })

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from video processor service')
      setSocketConnected(false)
      addLog('✗ Disconnected from video processor service')
    })

    socketInstance.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      addLog(`✗ Connection error: ${error.message}`)
    })

    socketInstance.on('progress', (data) => {
      setProgress(data.progress)
      addLog(`Processing: ${data.clipName} - ${data.progress.toFixed(1)}%`)
      
      if (data.status === 'completed') {
        setCompletedClips(prev => [...prev, data.clipId])
      }
    })

    socketInstance.on('log', (message) => {
      addLog(message)
    })

    socketInstance.on('process-complete', (data) => {
      if (data.success) {
        addLog('✓ All clips processed successfully!')
        addLog(`Output saved to: Downloads/KlipPod_Output`)
        // Refresh processed videos list
        fetchProcessedVideos()
      } else {
        addLog(`✗ Processing failed: ${data.error}`)
      }
      setProcessing(false)
    })

    socketInstance.on('download-progress', (data) => {
      setDownloadProgress(data.progress)
      addLog(`Downloading: ${data.progress.toFixed(1)}%`)
    })

    socketInstance.on('download-complete', (data) => {
      if (data.success) {
        setVideoPath(data.videoPath)
        setDownloadProgress(0)
        addLog('✓ YouTube video downloaded successfully!')
        addLog(`File: ${data.videoPath}`)
      } else {
        addLog(`✗ Download failed: ${data.error}`)
      }
    })

    setSocket(socketInstance)

    return () => {
      socketInstance.disconnect()
    }
  }, [])

  const processAllClips = () => {
    if (clips.length === 0) {
      addLog('Error: No clips to process')
      return
    }

    if (!videoPath && !youtubeUrl) {
      addLog('Error: Please upload a video or provide YouTube URL')
      return
    }

    if (!socketConnected) {
      addLog('Error: WebSocket not connected. Please wait...')
      return
    }

    setProcessing(true)
    setProgress(0)
    setCompletedClips([])

    addLog('Starting batch processing...')
    addLog(`Processing ${clips.length} clip(s)`)

    socket?.emit('process-video', {
      videoPath,
      clips,
      facecamSettings,
      gameplaySettings,
      watermark,
      logoPath: logoPath || undefined,
      splitEnabled  // Send split mode toggle to backend
    })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary to-purple-600 text-primary-foreground p-2.5 rounded-xl shadow-lg">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">KlipPod Pro</h1>
                <p className="text-xs text-muted-foreground">Video Clipper</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              >
                {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Badge variant={socketConnected ? "default" : "secondary"} className="gap-2 h-8">
                <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs">{socketConnected ? 'Connected' : 'Offline'}</span>
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-3 py-4 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left - Video Preview Area (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {/* Input & Video */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">Video Source</CardTitle>
                    <CardDescription className="text-xs">Upload or enter YouTube URL</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-8">
                    <TabsTrigger value="upload" className="text-xs">
                      <Upload className="w-3 h-3 mr-1.5" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="youtube" className="text-xs">
                      <Youtube className="w-3 h-3 mr-1.5" />
                      YouTube
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="upload" className="space-y-3 mt-3">
                    {videoFile ? (
                      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                        <div className="flex items-center gap-2 truncate">
                          <Video className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium truncate">{videoFile.name}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => {
                          setVideoFile(null)
                          setVideoUrl('')
                          addLog('Video file cleared')
                        }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        className="border-2 border-dashed border-primary/30 rounded-lg p-4 text-center hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Upload Video</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".mp4,.mkv,.mov"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="youtube" className="space-y-3 mt-3">
                    <Input
                      placeholder="https://youtube.com/watch?v=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      className="text-sm"
                    />
                    <Button
                      className="w-full h-9 text-sm"
                      onClick={handleYoutubeUrl}
                      disabled={!youtubeUrl}
                    >
                      <Youtube className="w-3.5 h-3.5 mr-1.5" />
                      Download
                    </Button>
                  </TabsContent>
                </Tabs>

                <Separator className="my-2" />

                {/* Compact Video Preview - Not Full Screen */}
                {videoUrl && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-muted-foreground">Video Preview</div>
                      <div className="text-[10px] text-muted-foreground">Source & Live View</div>
                    </div>
                    <div className="flex gap-2 h-[200px]">
                      {/* Original Video - Compact */}
                      <div className="flex-1 relative bg-black rounded-lg overflow-hidden border border-border/30">
                        <div className="absolute top-1.5 left-1.5 bg-black/70 text-white/90 text-[10px] px-1.5 py-0.5 rounded font-medium z-10">
                          SOURCE
                        </div>
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          className="w-full h-full object-contain"
                          controls
                        />
                      </div>

                      {/* Live Preview - Compact */}
                      <div className="flex-1 relative bg-black rounded-lg overflow-hidden border border-primary/30">
                        <div className="absolute top-1.5 left-1.5 bg-primary/90 text-white text-[10px] px-1.5 py-0.5 rounded font-bold z-10">
                          PREVIEW
                        </div>
                        {splitEnabled ? (
                          <div className="flex flex-col h-full">
                            <div className="flex-1 relative bg-gradient-to-b from-blue-900/40 to-blue-900/30 border-b border-blue-500/40 flex items-center justify-center">
                              <div className="text-center text-white/90">
                                <div className="text-[11px] font-semibold mb-0.5">Facecam</div>
                                <div className="text-[9px] opacity-80">{facecamSettings.height}%</div>
                              </div>
                            </div>
                            <div className="flex-1 relative bg-gradient-to-t from-green-900/40 to-green-900/30 border-t border-green-500/40 flex items-center justify-center">
                              <div className="text-center text-white/90">
                                <div className="text-[11px] font-semibold mb-0.5">Gameplay</div>
                                <div className="text-[9px] opacity-80">{gameplaySettings.height}%</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <video
                              src={videoUrl}
                              className="w-full h-full object-cover"
                              style={{
                                transform: `scale(${facecamSettings.zoom / 100}) translate(${facecamSettings.panX * 2}px, ${facecamSettings.panY * 2}px)`,
                                transformOrigin: 'center'
                              }}
                              muted
                              loop
                              autoPlay
                            />
                            <div className="absolute inset-0 border-2 border-green-500/50 pointer-events-none">
                              <div className="absolute bottom-1.5 left-1.5 bg-black/80 text-green-300 text-[9px] px-1.5 py-0.5 rounded font-mono">
                                Z:{facecamSettings.zoom}% P:{facecamSettings.panX},{facecamSettings.panY}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {!videoUrl && (
                  <div className="h-[200px] flex items-center justify-center bg-muted/30 rounded-lg border-2 border-dashed border-muted/40">
                    <div className="text-center text-muted-foreground">
                      <Video className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs">No video loaded</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right - Controls Panel (5 cols) */}
          <div className="lg:col-span-5">
            <div className="space-y-3">
              {/* Mode Toggle */}
              <Card className="p-4 transition-all hover:border-primary/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary transition-transform hover:scale-110" />
                    <div>
                      <div className="text-sm font-semibold transition-colors">Split Mode</div>
                      <div className="text-[10px] text-muted-foreground">
                        {splitEnabled ? 'Facecam + Gameplay' : 'Full Video'}
                      </div>
                    </div>
                  </div>
                  <Switch
                    checked={splitEnabled}
                    onCheckedChange={setSplitEnabled}
                    className="scale-90 transition-all hover:scale-95"
                  />
                </div>
              </Card>

              {/* Controls */}
              {splitEnabled ? (
                // Split Mode Controls
                <Card className="p-4">
                  <div className="space-y-4">
                    <div className="text-xs font-semibold text-blue-500 mb-2">Facecam (Top)</div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Height</span>
                          <span className="font-mono text-primary">{facecamSettings.height}%</span>
                        </div>
                        <Slider
                          value={[facecamSettings.height]}
                          onValueChange={([v]) => setFacecamSettings(prev => ({ ...prev, height: v }))}
                          min={20}
                          max={50}
                          step={1}
                          className="h-5"
                        />
                      </div>
                    </div>
                    <Separator className="my-3" />
                    <div className="text-xs font-semibold text-green-500 mb-2">Gameplay (Bottom)</div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Height</span>
                          <span className="font-mono text-primary">{gameplaySettings.height}%</span>
                        </div>
                        <Slider
                          value={[gameplaySettings.height]}
                          onValueChange={([v]) => setGameplaySettings(prev => ({ ...prev, height: v }))}
                          min={40}
                          max={80}
                          step={1}
                          className="h-5"
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                // Full Mode Controls
                <Card className="p-4">
                  <div className="space-y-3">
                    <div className="text-xs font-semibold text-primary mb-3">Zoom & Pan</div>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[11px] text-muted-foreground">
                          <span>Zoom</span>
                          <span className="font-mono text-primary">{facecamSettings.zoom}%</span>
                        </div>
                        <Slider
                          value={[facecamSettings.zoom]}
                          onValueChange={([v]) => setFacecamSettings(prev => ({ ...prev, zoom: v }))}
                          min={50}
                          max={200}
                          step={5}
                          className="h-5"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Pan X</span>
                            <span className="font-mono text-primary">{facecamSettings.panX}</span>
                          </div>
                          <Slider
                            value={[facecamSettings.panX]}
                            onValueChange={([v]) => setFacecamSettings(prev => ({ ...prev, panX: v }))}
                            min={-100}
                            max={100}
                            step={5}
                            className="h-5"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Pan Y</span>
                            <span className="font-mono text-primary">{facecamSettings.panY}</span>
                          </div>
                          <Slider
                            value={[facecamSettings.panY]}
                            onValueChange={([v]) => setFacecamSettings(prev => ({ ...prev, panY: v }))}
                            min={-100}
                            max={100}
                            step={5}
                            className="h-5"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              {/* Clips */}
              <Card className="p-4 transition-all hover:border-primary/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-primary transition-transform hover:scale-110" />
                    <span className="text-sm font-semibold transition-colors">Clips</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5 transition-all">{clips.length}</Badge>
                </div>
                <Button
                  className="w-full h-8 text-xs mb-3 transition-all hover:scale-105"
                  onClick={addClip}
                  disabled={processing}
                >
                  <Plus className="w-3 h-3 mr-1.5" />
                  Add Clip
                </Button>
                {clips.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Plus className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No clips</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {clips.map((clip) => (
                      <div
                        key={clip.id}
                        className={`p-2 rounded-lg border transition-all cursor-pointer ${
                          currentClipId === clip.id
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50'
                        }`}
                        onClick={() => setCurrentClipId(clip.id)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Input
                            value={clip.name}
                            onChange={(e) => updateClip(clip.id, 'name', e.target.value)}
                            className="text-xs font-semibold h-6 px-2 py-0"
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={(e) => { e.stopPropagation(); removeClip(clip.id) }}
                              disabled={processing}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">Start</div>
                            <Input
                              type="text"
                              value={clip.startTime}
                              onChange={(e) => updateClip(clip.id, 'startTime', e.target.value)}
                              placeholder="00:00:00"
                              className="text-[11px] font-mono h-7 px-2 py-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">End</div>
                            <Input
                              type="text"
                              value={clip.endTime}
                              onChange={(e) => updateClip(clip.id, 'endTime', e.target.value)}
                              placeholder="00:00:10"
                              className="text-[11px] font-mono h-7 px-2 py-0"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                        {completedClips.includes(clip.id) && (
                          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-green-500">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Completed</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {clips.length > 0 && (
                  <>
                    <Separator className="my-3" />
                    <div className="space-y-2">
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>Progress</span>
                        <span className="font-mono">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-1.5" />
                      <Button
                        className="w-full h-8 text-xs"
                        onClick={processAllClips}
                        disabled={processing}
                      >
                        {processing ? (
                          <>
                            <Pause className="w-3 h-3 mr-1.5" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Play className="w-3 h-3 mr-1.5" />
                            Process Clips
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </Card>

              {/* Watermark */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Type className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold">Branding</span>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Watermark Text</Label>
                    <Textarea
                      placeholder="Enter watermark..."
                      value={watermark}
                      onChange={(e) => setWatermark(e.target.value)}
                      rows={2}
                      className="text-xs resize-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px]">Logo</Label>
                    <div
                      className="border-2 border-dashed rounded-lg p-3 text-center hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {logoFile ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <ImageIcon className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs truncate">{logoFile.name}</span>
                          </div>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setLogoFile(null)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <ImageIcon className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                          <p className="text-xs text-muted-foreground">Upload Logo</p>
                        </>
                      )}
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept=".png"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Processed Videos */}
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-sm font-semibold">Download</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px] h-5">{processedVideos.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={fetchProcessedVideos}
                  className="w-full h-7 text-xs mb-3"
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Refresh
                </Button>
                {processedVideos.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <CheckCircle2 className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
                    <p className="text-xs">No videos</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[180px] overflow-y-auto pr-2">
                    {processedVideos.map((video, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate mb-0.5">{video.filename}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatFileSize(video.size)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleDownload(video.filename)}
                          className="shrink-0 h-6 w-6 p-0"
                        >
                          <Download className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Logs */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Terminal className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold">Logs</span>
                </div>
                <div className="bg-black/90 rounded-lg p-3 max-h-[150px] overflow-y-auto font-mono text-[10px] text-green-400">
                  {logs.length === 0 ? (
                    <p className="text-gray-600">No logs...</p>
                  ) : (
                    logs.map((log, index) => (
                      <p key={index} className="mb-0.5 last:mb-0">{log}</p>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-3 py-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>KlipPod Pro • 1080x1920 • MP4</span>
            <span className="text-xs">v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
