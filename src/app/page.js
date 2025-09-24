'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Download, Share2, Lock, Clock, Zap, Users, Trash2, 
  Copy, QrCode, Moon, Sun, Plus, X, File, Image, Video, Archive, 
  Camera, CheckCircle, AlertCircle, Loader2, Wifi, WifiOff 
} from 'lucide-react';

const FileShare = () => {
  // Core state
  const [mode, setMode] = useState('home'); // 'home', 'create', 'join', 'room', 'qr-scanner'
  const [darkMode, setDarkMode] = useState(true);
  const [userId] = useState(() => uuidv4()); // Persistent user ID for session
  
  // Room state
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomStats, setRoomStats] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  
  // Create room state
  const [createPassword, setCreatePassword] = useState('');
  const [expiry, setExpiry] = useState('1h');
  
  // File state
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  
  // UI state
  const [timeLeft, setTimeLeft] = useState('');
  const [notification, setNotification] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  const [qrCode, setQrCode] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  // Refs
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const qrScannerRef = useRef(null);
  const qrCodeRef = useRef(null);

  // Initialize QR Code generator
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const qr = new QRCodeStyling({
        width: 200,
        height: 200,
        type: "svg",
        data: "",
        image: "",
        dotsOptions: {
          color: darkMode ? "#ffffff" : "#000000",
          type: "rounded"
        },
        backgroundOptions: {
          color: darkMode ? "#1f2937" : "#ffffff",
        },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 20
        }
      });
      setQrCode(qr);
    }
  }, [darkMode]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Timer for room stats and expiry
  useEffect(() => {
    let timer;
    if (mode === 'room' && currentRoom) {
      timer = setInterval(() => {
        try {
          const stats = roomManager.getRoomStats(userId);
          if (!stats) {
            // Room expired or user was removed
            showNotification('Room has expired', 'error');
            handleLeaveRoom();
            return;
          }
          
          setRoomStats(stats);
          
          // Update time left display
          if (stats.timeLeft <= 0) {
            showNotification('Room has expired', 'error');
            handleLeaveRoom();
          } else {
            const minutes = Math.floor(stats.timeLeft / 60000);
            const seconds = Math.floor((stats.timeLeft % 60000) / 1000);
            setTimeLeft(`${minutes}:${seconds.toString().padStart(2, '0')}`);
          }
        } catch (error) {
          console.error('Error updating room stats:', error);
        }
      }, 1000);
    }
    
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [mode, currentRoom, userId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up room on unmount
      if (currentRoom) {
        roomManager.leaveRoom(userId);
      }
      // Clean up file URLs
      files.forEach(file => {
        if (file.url && file.url.startsWith('blob:')) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, []);

  // Load room files when room changes
  useEffect(() => {
    if (mode === 'room' && currentRoom) {
      try {
        const roomFiles = roomManager.getRoomFiles(userId);
        setFiles(roomFiles);
      } catch (error) {
        console.error('Error loading room files:', error);
      }
    } else {
      setFiles([]);
    }
  }, [mode, currentRoom, userId]);

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type, id: Date.now() });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleCreateRoom = async () => {
    try {
      const room = roomManager.createRoom(userId, createPassword, expiry);
      setCurrentRoom(room);
      
      // Generate QR code
      const qrData = `${window.location.origin}?join=${room.code}${createPassword ? `&p=${encodeURIComponent(createPassword)}` : ''}`;
      if (qrCode) {
        qrCode.update({ data: qrData });
        if (qrCodeRef.current) {
          qrCode.append(qrCodeRef.current);
        }
      }
      
      setMode('room');
      showNotification(`Room ${room.code} created successfully!`, 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleJoinRoom = async () => {
    if (joinCode.length < 4) {
      showNotification('Please enter a valid room code', 'error');
      return;
    }
    
    try {
      // First peek at room to check if it exists and needs password
      const roomInfo = roomManager.peekRoom(joinCode);
      if (!roomInfo) {
        showNotification('Room not found or has expired', 'error');
        return;
      }
      
      if (roomInfo.hasPassword && !joinPassword) {
        showNotification('This room requires a password', 'error');
        return;
      }
      
      const room = roomManager.joinRoom(userId, joinCode, joinPassword);
      setCurrentRoom(room);
      setMode('room');
      showNotification(`Joined room ${room.code}!`, 'success');
    } catch (error) {
      showNotification(error.message, 'error');
    }
  };

  const handleLeaveRoom = () => {
    try {
      roomManager.leaveRoom(userId);
      setCurrentRoom(null);
      setRoomStats(null);
      setFiles([]);
      setTimeLeft('');
      setMode('home');
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  };

  const handleFileSelect = (event) => {
    const selectedFiles = Array.from(event.target.files);
    processFiles(selectedFiles);
  };

  const processFiles = async (fileList) => {
    if (!currentRoom) {
      showNotification('You must be in a room to upload files', 'error');
      return;
    }

    for (const file of fileList) {
      try {
        const fileData = {
          name: file.name,
          size: formatFileSize(file.size),
          type: getFileType(file.name),
          progress: 0,
          uploaded: false,
          file: file,
          url: null
        };

        // Add to room manager
        const roomFile = roomManager.addFileToRoom(userId, fileData);
        
        // Start processing
        processFile(roomFile, file);
      } catch (error) {
        showNotification(`Error uploading ${file.name}: ${error.message}`, 'error');
      }
    }
  };

  const processFile = async (fileData, file) => {
    try {
      // Create object URL for the file
      const url = URL.createObjectURL(file);
      
      // Simulate processing with progress updates
      let progress = 0;
      const interval = setInterval(() => {
        progress += Math.random() * 20 + 5;
        if (progress >= 100) {
          progress = 100;
          clearInterval(interval);
          
          // Update file as completed
          try {
            const updatedFiles = roomManager.getRoomFiles(userId);
            const updatedFile = updatedFiles.find(f => f.id === fileData.id);
            if (updatedFile) {
              updatedFile.progress = 100;
              updatedFile.uploaded = true;
              updatedFile.url = url;
              setFiles([...updatedFiles]);
            }
          } catch (error) {
            console.error('Error updating file:', error);
          }
        } else {
          // Update progress
          try {
            const updatedFiles = roomManager.getRoomFiles(userId);
            const updatedFile = updatedFiles.find(f => f.id === fileData.id);
            if (updatedFile) {
              updatedFile.progress = Math.round(progress);
              setFiles([...updatedFiles]);
            }
          } catch (error) {
            console.error('Error updating file progress:', error);
          }
        }
      }, 150);
    } catch (error) {
      showNotification(`Error processing ${fileData.name}`, 'error');
    }
  };

  const downloadFile = (file) => {
    if (!file.url) return;
    
    const a = document.createElement('a');
    a.href = file.url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAllAsZip = async () => {
    const uploadedFiles = files.filter(f => f.uploaded && f.url);
    if (uploadedFiles.length === 0) {
      showNotification('No files available for download', 'error');
      return;
    }
    
    try {
      const zip = new JSZip();
      const promises = [];
      
      for (const file of uploadedFiles) {
        const promise = fetch(file.url)
          .then(response => response.blob())
          .then(blob => {
            zip.file(file.name, blob);
          });
        promises.push(promise);
      }
      
      await Promise.all(promises);
      
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `room-${currentRoom?.code}-files.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      URL.revokeObjectURL(url);
      showNotification('Files downloaded successfully!', 'success');
    } catch (error) {
      showNotification('Error creating zip file', 'error');
    }
  };

  const removeFile = (fileId) => {
    try {
      const success = roomManager.removeFileFromRoom(userId, fileId);
      if (success) {
        const updatedFiles = roomManager.getRoomFiles(userId);
        setFiles(updatedFiles);
        showNotification('File removed successfully', 'success');
      } else {
        showNotification('Failed to remove file', 'error');
      }
    } catch (error) {
      showNotification('Error removing file', 'error');
    }
  };

  const startQRScanner = async () => {
    try {
      setIsScanning(true);
      setMode('qr-scanner');
      
      if (videoRef.current) {
        const scanner = new QrScanner(
          videoRef.current,
          (result) => {
            // Extract room code from result
            let roomCode = result.data;
            let password = '';
            
            // Handle URL format
            if (roomCode.includes('join=')) {
              const url = new URL(roomCode);
              roomCode = url.searchParams.get('join');
              password = url.searchParams.get('p') || '';
            }
            
            setJoinCode(roomCode);
            setJoinPassword(password);
            stopQRScanner();
            setMode('join');
            
            // Auto-join if we have all required info
            if (roomCode && roomCode.length >= 4) {
              setTimeout(() => {
                const event = { preventDefault: () => {} };
                handleJoinRoom();
              }, 100);
            }
          },
          {
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
          }
        );
        
        qrScannerRef.current = scanner;
        await scanner.start();
      }
    } catch (error) {
      console.error('Error starting QR scanner:', error);
      showNotification('Failed to start camera', 'error');
      setIsScanning(false);
      setMode('join');
    }
  };

  const stopQRScanner = () => {
    if (qrScannerRef.current) {
      qrScannerRef.current.stop();
      qrScannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (items) {
      const files = [];
      for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        processFiles(files);
      }
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      showNotification('Copied to clipboard!', 'success');
    } catch (error) {
      showNotification('Failed to copy to clipboard', 'error');
    }
  };

  const copyRoomLink = async () => {
    if (!currentRoom) return;
    
    const link = `${window.location.origin}?join=${currentRoom.code}${currentRoom.password ? `&p=${encodeURIComponent(currentRoom.password)}` : ''}`;
    await copyToClipboard(link);
  };

  // URL parameter handling for direct room joining
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const joinParam = urlParams.get('join');
      const passwordParam = urlParams.get('p');
      
      if (joinParam && mode === 'home') {
        setJoinCode(joinParam);
        setJoinPassword(passwordParam || '');
        setMode('join');
        
        // Auto-join if password is provided
        if (passwordParam !== null) {
          setTimeout(() => {
            roomManager.joinRoom(userId, joinParam, passwordParam || '')
              .then(room => {
                setCurrentRoom(room);
                setMode('room');
                showNotification(`Joined room ${room.code}!`, 'success');
              })
              .catch(error => {
                showNotification(error.message, 'error');
              });
          }, 500);
        }
      }
    }
  }, []);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileType = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
    if (['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'].includes(ext)) return 'video';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
    return 'file';
  };

  const getFileIcon = (type) => {
    switch (type) {
      case 'image': return <Image className="w-5 h-5" />;
      case 'video': return <Video className="w-5 h-5" />;
      case 'archive': return <Archive className="w-5 h-5" />;
      default: return <File className="w-5 h-5" />;
    }
  };

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Asimovian&family=Bitcount+Prop+Double+Ink:wght@100..900&family=Share+Tech&display=swap');
      `}</style>
      
      <div className={`min-h-screen transition-all duration-300 font-primary ${darkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
        {/* Notification */}
        {notification && (
          <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
            <div className={`px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 ${
              notification.type === 'success' ? 'bg-green-600 text-white' :
              notification.type === 'error' ? 'bg-red-600 text-white' :
              darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'
            }`}>
              {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
              {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
              <span>{notification.message}</span>
            </div>
          </div>
        )}

        {/* Connection Status */}
        {!isOnline && (
          <div className="fixed bottom-4 left-4 z-50">
            <div className="px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2">
              <WifiOff className="w-4 h-4" />
              <span className="text-sm">Offline</span>
            </div>
          </div>
        )}

        <div className="container mx-auto px-4 py-8 max-w-4xl" onPaste={handlePaste}>
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
              <div className={`p-3 rounded-full ${darkMode ? 'bg-blue-600' : 'bg-blue-500'}`}>
                <Share2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-heading">SecureShare</h1>
                {isOnline && <div className="flex items-center gap-1 text-sm text-green-500">
                  <Wifi className="w-3 h-3" />
                  <span>Online</span>
                </div>}
              </div>
            </div>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          {/* Home Screen */}
          {mode === 'home' && (
            <div className="text-center">
              <div className="mb-8">
                <h2 className="text-4xl font-bold mb-4 font-display bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                  Instant, Secure File Transfers
                </h2>
                <p className={`text-lg ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  No sign-up. No leftover files. No size worries. Just share.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto mb-12">
                <button
                  onClick={() => setMode('create')}
                  className={`group p-8 rounded-2xl border-2 border-dashed transition-all hover:scale-105 ${
                    darkMode 
                      ? 'border-blue-500 hover:bg-blue-500/10 hover:border-blue-400' 
                      : 'border-blue-400 hover:bg-blue-50 hover:border-blue-500'
                  }`}
                >
                  <Plus className="w-12 h-12 mx-auto mb-4 text-blue-500 group-hover:animate-pulse" />
                  <h3 className="text-xl font-semibold mb-2 font-heading">Create Room</h3>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                    Start sharing files instantly
                  </p>
                </button>

                <button
                  onClick={() => setMode('join')}
                  className={`group p-8 rounded-2xl border-2 border-dashed transition-all hover:scale-105 ${
                    darkMode 
                      ? 'border-green-500 hover:bg-green-500/10 hover:border-green-400' 
                      : 'border-green-400 hover:bg-green-50 hover:border-green-500'
                  }`}
                >
                  <Users className="w-12 h-12 mx-auto mb-4 text-green-500 group-hover:animate-bounce-slow" />
                  <h3 className="text-xl font-semibold mb-2 font-heading">Join Room</h3>
                  <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                    Enter a room code to connect
                  </p>
                </button>
              </div>

              {/* Features */}
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center group">
                  <Zap className="w-8 h-8 mx-auto mb-3 text-yellow-500 group-hover:animate-pulse-slow" />
                  <h4 className="font-semibold mb-2 font-heading">Lightning Fast</h4>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Direct peer-to-peer transfers with instant processing
                  </p>
                </div>
                <div className="text-center group">
                  <Lock className="w-8 h-8 mx-auto mb-3 text-green-500 group-hover:animate-pulse-slow" />
                  <h4 className="font-semibold mb-2 font-heading">Secure & Private</h4>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Files stay in your browser. No server storage.
                  </p>
                </div>
                <div className="text-center group">
                  <Clock className="w-8 h-8 mx-auto mb-3 text-blue-500 group-hover:animate-pulse-slow" />
                  <h4 className="font-semibold mb-2 font-heading">Auto-Expiring</h4>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Rooms disappear automatically for privacy
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Create Room */}
          {mode === 'create' && (
            <div className="max-w-md mx-auto">
              <button
                onClick={() => setMode('home')}
                className={`mb-6 text-sm flex items-center gap-2 ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                ← Back to Home
              </button>
              
              <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <h2 className="text-2xl font-bold mb-6 font-heading">Create New Room</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Room Password (Optional)</label>
                    <input
                      type="password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                      placeholder="Leave blank for public room"
                      className={`w-full px-4 py-3 rounded-lg border ${
                        darkMode 
                          ? 'bg-gray-700 border-gray-600 focus:border-blue-500 text-white' 
                          : 'bg-gray-50 border-gray-300 focus:border-blue-500'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Auto-delete after</label>
                    <select
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className={`w-full px-4 py-3 rounded-lg border ${
                        darkMode 
                          ? 'bg-gray-700 border-gray-600 focus:border-blue-500 text-white' 
                          : 'bg-gray-50 border-gray-300 focus:border-blue-500'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-colors`}
                    >
                      <option value="5m">5 minutes</option>
                      <option value="30m">30 minutes</option>
                      <option value="1h">1 hour</option>
                      <option value="6h">6 hours</option>
                      <option value="24h">24 hours</option>
                    </select>
                  </div>

                  <button
                    onClick={handleCreateRoom}
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
                  >
                    Create Room
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Join Room */}
          {mode === 'join' && (
            <div className="max-w-md mx-auto">
              <button
                onClick={() => setMode('home')}
                className={`mb-6 text-sm flex items-center gap-2 ${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}
              >
                ← Back to Home
              </button>
              
              <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <h2 className="text-2xl font-bold mb-6 font-heading">Join Room</h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Room Code</label>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter room code"
                      className={`w-full px-4 py-3 rounded-lg border ${
                        darkMode 
                          ? 'bg-gray-700 border-gray-600 focus:border-green-500 text-white' 
                          : 'bg-gray-50 border-gray-300 focus:border-green-500'
                      } focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-colors`}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Password (if required)</label>
                    <input
                      type="password"
                      value={joinPassword}
                      onChange={(e) => setJoinPassword(e.target.value)}
                      placeholder="Room password"
                      className={`w-full px-4 py-3 rounded-lg border ${
                        darkMode 
                          ? 'bg-gray-700 border-gray-600 focus:border-green-500 text-white' 
                          : 'bg-gray-50 border-gray-300 focus:border-green-500'
                      } focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-colors`}
                    />
                  </div>

                  <button
                    onClick={handleJoinRoom}
                    disabled={joinCode.length < 4}
                    className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:hover:scale-100"
                  >
                    Join Room
                  </button>

                  <div className="text-center">
                    <div className={`my-4 flex items-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      <div className="flex-1 h-px bg-gray-300"></div>
                      <span className="px-3 text-sm">Or</span>
                      <div className="flex-1 h-px bg-gray-300"></div>
                    </div>
                    
                    <button
                      onClick={startQRScanner}
                      className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
                        darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      <Camera className="w-4 h-4" />
                      <span>Scan QR Code</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* QR Scanner */}
          {mode === 'qr-scanner' && (
            <div className="max-w-md mx-auto">
              <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold font-heading">Scan QR Code</h2>
                  <button
                    onClick={() => {
                      stopQRScanner();
                      setMode('join');
                    }}
                    className="p-2 rounded-lg hover:bg-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="relative">
                  <video
                    ref={videoRef}
                    className="w-full rounded-lg"
                    autoPlay
                    playsInline
                    muted
                  />
                  {isScanning && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                      <div className="text-white text-center">
                        <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                        <p className="text-sm">Scanning...</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <p className={`text-center text-sm mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Position QR code within the camera view
                </p>
              </div>
            </div>
          )}

          {/* Room View */}
          {mode === 'room' && currentRoom && (
            <div>
              {/* Room Header */}
              <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg mb-6`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-bold font-heading">Room {currentRoom.code}</h2>
                      {currentRoom.password && <Lock className="w-5 h-5 text-yellow-500" />}
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <Users className="w-4 h-4" />
                        {roomStats?.connectedUsers || 1} connected
                      </span>
                      <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        <Clock className="w-4 h-4" />
                        {timeLeft} left
                      </span>
                      {files.length > 0 && (
                        <span className={`flex items-center gap-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          <File className="w-4 h-4" />
                          {files.length} files
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => copyToClipboard(currentRoom.code)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        darkMode ? 'bg-blue-600 hover:bg-blue-700' : 'bg-blue-500 hover:bg-blue-600'
                      } text-white transform hover:scale-105`}
                    >
                      <Copy className="w-4 h-4" />
                      Copy Code
                    </button>
                    <button
                      onClick={copyRoomLink}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        darkMode ? 'bg-purple-600 hover:bg-purple-700' : 'bg-purple-500 hover:bg-purple-600'
                      } text-white transform hover:scale-105`}
                    >
                      <Share2 className="w-4 h-4" />
                      Share Link
                    </button>
                    <div className="relative group">
                      <button className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        darkMode ? 'bg-green-600 hover:bg-green-700' : 'bg-green-500 hover:bg-green-600'
                      } text-white transform hover:scale-105`}>
                        <QrCode className="w-4 h-4" />
                        QR
                      </button>
                      <div className="absolute top-full mt-2 right-0 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10">
                        <div className={`p-4 rounded-lg shadow-xl ${darkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border'}`}>
                          <div ref={qrCodeRef} className="w-48 h-48"></div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleLeaveRoom}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                        darkMode ? 'bg-red-600 hover:bg-red-700' : 'bg-red-500 hover:bg-red-600'
                      } text-white transform hover:scale-105`}
                    >
                      <X className="w-4 h-4" />
                      Leave
                    </button>
                  </div>
                </div>
              </div>

              {/* File Drop Area */}
              <div
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                className={`relative p-8 rounded-2xl border-2 border-dashed mb-6 transition-all cursor-pointer ${
                  isDragOver
                    ? 'border-blue-500 bg-blue-500/10 scale-102'
                    : darkMode
                    ? 'border-gray-600 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800/70'
                    : 'border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  multiple
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="text-center">
                  <Upload className={`w-16 h-16 mx-auto mb-4 transition-all ${isDragOver ? 'text-blue-500 animate-bounce' : 'text-gray-400'}`} />
                  <h3 className="text-xl font-semibold mb-2 font-heading">
                    {isDragOver ? 'Drop files here!' : 'Drop files here or click to upload'}
                  </h3>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-4`}>
                    Support multiple files • Paste screenshots (Ctrl+V) • Any file size
                  </p>
                  <div className="flex items-center justify-center gap-4 text-sm">
                    <span className="flex items-center gap-1 text-green-500">
                      <CheckCircle className="w-4 h-4" />
                      Secure
                    </span>
                    <span className="flex items-center gap-1 text-blue-500">
                      <Zap className="w-4 h-4" />
                      Instant
                    </span>
                    <span className="flex items-center gap-1 text-purple-500">
                      <Lock className="w-4 h-4" />
                      Private
                    </span>
                  </div>
                </div>
              </div>

              {/* Files List */}
              {files.length > 0 && (
                <div className={`p-6 rounded-2xl ${darkMode ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold font-heading">Files ({files.length})</h3>
                    {files.filter(f => f.uploaded).length > 1 && (
                      <button 
                        onClick={downloadAllAsZip}
                        className="flex items-center gap-2 text-blue-500 hover:text-blue-400 text-sm font-medium transition-colors"
                      >
                        <Archive className="w-4 h-4" />
                        Download All as ZIP
                      </button>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    {files.map((file) => (
                      <div key={file.id} className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                        darkMode ? 'bg-gray-700 hover:bg-gray-650' : 'bg-gray-50 hover:bg-gray-100'
                      } ${file.uploaded ? 'border-l-4 border-green-500' : ''}`}>
                        <div className={`p-3 rounded-lg ${
                          file.uploaded 
                            ? 'bg-green-500/20 text-green-500' 
                            : darkMode ? 'bg-gray-600' : 'bg-white'
                        }`}>
                          {getFileIcon(file.type)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium truncate">{file.name}</p>
                            {file.uploaded && (
                              <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                                Ready
                              </span>
                            )}
                          </div>
                          <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {file.size} • Uploaded by {file.uploadedBy === userId ? 'You' : 'Other user'}
                          </p>
                          
                          {!file.uploaded && (
                            <div className="mt-3">
                              <div className={`w-full bg-gray-300 rounded-full h-2 ${darkMode ? 'bg-gray-600' : ''}`}>
                                <div
                                  className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${file.progress || 0}%` }}
                                ></div>
                              </div>
                              <p className="text-xs text-blue-500 mt-1">{file.progress || 0}% processed</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          {file.uploaded && (
                            <button 
                              onClick={() => downloadFile(file)}
                              className="p-2 text-blue-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-all"
                              title="Download file"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                          )}
                          {(file.uploadedBy === userId || currentRoom.createdBy === userId) && (
                            <button 
                              onClick={() => removeFile(file.id)}
                              className="p-2 text-red-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Remove file"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {files.length === 0 && (
                <div className={`text-center py-12 rounded-2xl ${darkMode ? 'bg-gray-800/50' : 'bg-white/50'}`}>
                  <File className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                  <h3 className="text-lg font-semibold mb-2 font-heading">No files yet</h3>
                  <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Upload files to share them with room members
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default FileShare; 
