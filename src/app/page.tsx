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
  AlertCircle
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

export default function VideoClipper() {
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string>('')
  const [videoPath, setVideoPath] = useState<string>('')
  const [youtubeUrl, setYoutubeUrl] = useState<string>('')
  const [clips, setClips] = useState<Clip[]>([])
  const [currentClipId, setCurrentClipId] = useState<string | null>(null)
  const [logoPath, setLogoPath] = useState<string>('')
  const [socketConnected, setSocketConnected] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
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
      id: `clip-${Date.now()}`,
      name: `Clip ${clips.length + 1}`,
      startTime: '00:00:00',
      endTime: '00:00:10'
    }
    setClips([...clips, newClip])
    setCurrentClipId(newClip.id)
    addLog(`Added new clip: ${newClip.name}`)
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

  // WebSocket connection
  useEffect(() => {
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
      logoPath: logoPath || undefined
    })
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-primary text-primary-foreground p-2 rounded-lg">
                <Video className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">KlipPod Manual Pro</h1>
                <p className="text-sm text-muted-foreground">Web-Based Video Clipper</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={socketConnected ? "default" : "secondary"} className="gap-2">
                <div className={`w-2 h-2 rounded-full ${socketConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {socketConnected ? 'Connected' : 'Disconnected'}
              </Badge>
              <Badge variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                9:16 Vertical Format
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input & Video Preview */}
          <div className="space-y-6">
            {/* Input Manager */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="w-5 h-5" />
                  Input Manager
                </CardTitle>
                <CardDescription>
                  Upload local video or use YouTube URL
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="upload" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="upload">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload
                    </TabsTrigger>
                    <TabsTrigger value="youtube">
                      <Youtube className="w-4 h-4 mr-2" />
                      YouTube
                    </TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="upload" className="space-y-4 mt-4">
                    <div className="border-2 border-dashed rounded-lg p-6 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                         onClick={() => fileInputRef.current?.click()}>
                      <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mb-2">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        .MP4, .MKV, .MOV files
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".mp4,.mkv,.mov"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>
                    {videoFile && (
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-2">
                          <Video className="w-4 h-4" />
                          <span className="text-sm font-medium">{videoFile.name}</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => {
                          setVideoFile(null)
                          setVideoUrl('')
                          addLog('Video file cleared')
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="youtube" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label htmlFor="youtube">YouTube URL</Label>
                      <Input
                        id="youtube"
                        placeholder="https://youtube.com/watch?v=..."
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                      />
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={handleYoutubeUrl}
                      disabled={!youtubeUrl}
                    >
                      <Youtube className="w-4 h-4 mr-2" />
                      Download Video
                    </Button>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Video Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Video Preview</CardTitle>
                <CardDescription>
                  Original video preview
                </CardDescription>
              </CardHeader>
              <CardContent>
                {videoUrl ? (
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      src={videoUrl}
                      className="w-full h-full object-contain"
                      controls
                    />
                  </div>
                ) : (
                  <div className="aspect-video bg-muted rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <Video className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        No video loaded
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clipping Preview */}
            <Card>
              <CardHeader>
                <CardTitle>9:16 Output Preview</CardTitle>
                <CardDescription>
                  Final output preview with split mode
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-[9/16] bg-black rounded-lg overflow-hidden max-h-[500px] mx-auto">
                  {/* Facecam Area */}
                  <div 
                    className="absolute top-0 left-0 right-0 bg-blue-900/30 border-b-2 border-blue-500/50"
                    style={{ height: `${facecamSettings.height}%` }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                      <div className="text-center p-4">
                        <span className="block text-lg font-bold">Facecam</span>
                        <span className="text-xs">
                          {facecamSettings.zoom}% Zoom | 
                          Pan X: {facecamSettings.panX} | 
                          Pan Y: {facecamSettings.panY}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Gameplay Area */}
                  <div 
                    className="absolute bottom-0 left-0 right-0 bg-green-900/30 border-t-2 border-green-500/50"
                    style={{ height: `${gameplaySettings.height}%` }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                      <div className="text-center p-4">
                        <span className="block text-lg font-bold">Gameplay</span>
                        <span className="text-xs">
                          {gameplaySettings.zoom}% Zoom | 
                          Pan X: {gameplaySettings.panX} | 
                          Pan Y: {gameplaySettings.panY}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Watermark Preview */}
                  {watermark && (
                    <div className="absolute bottom-4 right-4 text-white/80 text-xs font-bold bg-black/50 px-3 py-1 rounded">
                      {watermark}
                    </div>
                  )}

                  {/* Logo Preview */}
                  {logoFile && (
                    <div className="absolute bottom-4 left-4 bg-black/50 p-2 rounded">
                      <ImageIcon className="w-6 h-6 text-white/80" />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Middle Column - Clipping List */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    Clipping List
                  </span>
                  <Badge variant="secondary">{clips.length} clips</Badge>
                </CardTitle>
                <CardDescription>
                  Manage your clips batch processing
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  className="w-full" 
                  onClick={addClip}
                  disabled={processing}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Clip
                </Button>

                {clips.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Plus className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No clips added yet</p>
                    <p className="text-xs">Click "Add New Clip" to start</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-3">
                      {clips.map((clip, index) => (
                        <Card 
                          key={clip.id}
                          className={`cursor-pointer transition-all ${
                            currentClipId === clip.id 
                              ? 'ring-2 ring-primary' 
                              : 'hover:bg-muted/50'
                          }`}
                          onClick={() => setCurrentClipId(clip.id)}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1 space-y-2">
                                <Input
                                  value={clip.name}
                                  onChange={(e) => updateClip(clip.id, 'name', e.target.value)}
                                  className="font-semibold"
                                  placeholder="Clip name"
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  removeClip(clip.id)
                                }}
                                disabled={processing}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Start Time</Label>
                                <Input
                                  type="text"
                                  value={clip.startTime}
                                  onChange={(e) => updateClip(clip.id, 'startTime', e.target.value)}
                                  placeholder="HH:MM:SS"
                                  className="text-sm font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">End Time</Label>
                                <Input
                                  type="text"
                                  value={clip.endTime}
                                  onChange={(e) => updateClip(clip.id, 'endTime', e.target.value)}
                                  placeholder="HH:MM:SS"
                                  className="text-sm font-mono"
                                />
                              </div>
                            </div>

                            {completedClips.includes(clip.id) && (
                              <div className="flex items-center gap-2 mt-3 text-sm text-green-600">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Completed</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </ScrollArea>
                )}

                {clips.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} />
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={processAllClips}
                      disabled={processing}
                    >
                      {processing ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Process All Clips
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Terminal Log */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Terminal Log
                </CardTitle>
                <CardDescription>
                  Real-time FFMPEG progress
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[250px] bg-black text-green-400 p-3 rounded-lg font-mono text-xs">
                  {logs.length === 0 ? (
                    <p className="text-gray-500">No logs yet...</p>
                  ) : (
                    logs.map((log, index) => (
                      <p key={index} className="mb-1">{log}</p>
                    ))
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Settings */}
          <div className="space-y-6">
            {/* Gamer Split Mode */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Gamer Split Mode
                </CardTitle>
                <CardDescription>
                  Configure facecam and gameplay areas
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Facecam Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Video className="w-4 h-4 text-blue-500" />
                    <h3 className="font-semibold">Facecam Area</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm">Height</Label>
                        <span className="text-sm font-mono">{facecamSettings.height}%</span>
                      </div>
                      <Slider
                        value={[facecamSettings.height]}
                        onValueChange={([value]) => 
                          setFacecamSettings(prev => ({ ...prev, height: value }))
                        }
                        min={20}
                        max={50}
                        step={1}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" />
                          Zoom
                        </Label>
                        <span className="text-sm font-mono">{facecamSettings.zoom}%</span>
                      </div>
                      <Slider
                        value={[facecamSettings.zoom]}
                        onValueChange={([value]) => 
                          setFacecamSettings(prev => ({ ...prev, zoom: value }))
                        }
                        min={50}
                        max={200}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          Pan X
                        </Label>
                        <span className="text-sm font-mono">{facecamSettings.panX}</span>
                      </div>
                      <Slider
                        value={[facecamSettings.panX]}
                        onValueChange={([value]) => 
                          setFacecamSettings(prev => ({ ...prev, panX: value }))
                        }
                        min={-100}
                        max={100}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          Pan Y
                        </Label>
                        <span className="text-sm font-mono">{facecamSettings.panY}</span>
                      </div>
                      <Slider
                        value={[facecamSettings.panY]}
                        onValueChange={([value]) => 
                          setFacecamSettings(prev => ({ ...prev, panY: value }))
                        }
                        min={-100}
                        max={100}
                        step={5}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Gameplay Settings */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b">
                    <Video className="w-4 h-4 text-green-500" />
                    <h3 className="font-semibold">Gameplay Area</h3>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm">Height</Label>
                        <span className="text-sm font-mono">{gameplaySettings.height}%</span>
                      </div>
                      <Slider
                        value={[gameplaySettings.height]}
                        onValueChange={([value]) => 
                          setGameplaySettings(prev => ({ ...prev, height: value }))
                        }
                        min={40}
                        max={80}
                        step={1}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <ZoomIn className="w-3 h-3" />
                          Zoom
                        </Label>
                        <span className="text-sm font-mono">{gameplaySettings.zoom}%</span>
                      </div>
                      <Slider
                        value={[gameplaySettings.zoom]}
                        onValueChange={([value]) => 
                          setGameplaySettings(prev => ({ ...prev, zoom: value }))
                        }
                        min={50}
                        max={200}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          Pan X
                        </Label>
                        <span className="text-sm font-mono">{gameplaySettings.panX}</span>
                      </div>
                      <Slider
                        value={[gameplaySettings.panX]}
                        onValueChange={([value]) => 
                          setGameplaySettings(prev => ({ ...prev, panX: value }))
                        }
                        min={-100}
                        max={100}
                        step={5}
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <Label className="text-sm flex items-center gap-1">
                          <Move className="w-3 h-3" />
                          Pan Y
                        </Label>
                        <span className="text-sm font-mono">{gameplaySettings.panY}</span>
                      </div>
                      <Slider
                        value={[gameplaySettings.panY]}
                        onValueChange={([value]) => 
                          setGameplaySettings(prev => ({ ...prev, panY: value }))
                        }
                        min={-100}
                        max={100}
                        step={5}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Visual Branding */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Type className="w-5 h-5" />
                  Visual Branding
                </CardTitle>
                <CardDescription>
                  Add watermarks and logo overlays
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="watermark">Text Watermark</Label>
                  <Textarea
                    id="watermark"
                    placeholder="Enter watermark text..."
                    value={watermark}
                    onChange={(e) => setWatermark(e.target.value)}
                    rows={2}
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label>Logo Overlay</Label>
                  <div 
                    className="border-2 border-dashed rounded-lg p-4 text-center hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      Click to upload logo
                    </p>
                    <p className="text-xs text-muted-foreground">
                      .PNG files only (transparent recommended)
                    </p>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept=".png"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </div>
                  {logoFile && (
                    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-2">
                        <ImageIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">{logoFile.name}</span>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => {
                          setLogoFile(null)
                          addLog('Logo file cleared')
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card mt-auto">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <p>KlipPod Manual Pro - Web Edition</p>
            <div className="flex items-center gap-4">
              <span>Output: 1080x1920 (9:16)</span>
              <Separator orientation="vertical" className="h-4" />
              <span>Format: MP4</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
