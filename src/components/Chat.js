import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Box, TextField, Button, Paper, Typography, Container, Alert, Snackbar, IconButton, Fab, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import io from 'socket.io-client';
import LoadingSpinner from './LoadingSpinner';
import CloseIcon from '@mui/icons-material/Close';
import RemoveIcon from '@mui/icons-material/Remove';
import ChatIcon from '@mui/icons-material/Chat';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SendIcon from '@mui/icons-material/Send';
import LinkIcon from '@mui/icons-material/Link';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import DeleteIcon from '@mui/icons-material/Delete';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';

import AddIcon from '@mui/icons-material/Add';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';


const quickReplies = [
  'Θέλω να σχεδιάσω κουζίνα',
  'Θέλω να δω επιλογές κουζινών',
  'Θέλω βοήθεια με αγορά & εγκατάσταση',
];

const initialBotMessage = {
  role: 'assistant',
  content: 'Γεια σου! Είμαι ο Gruppo IQ, ο ψηφιακός βοηθός της Gruppo Cucine. Πώς μπορώ να σε βοηθήσω;',
};

// Add TypingIndicator component
const TypingIndicator = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        px: 0.5,
        py: 0.5,
      }}
    >
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          sx={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: '#1a1a1a',
            opacity: 0.6,
            animation: 'typingBounce 1.2s infinite ease-in-out',
            animationDelay: `${i * 0.15}s`,
            '@keyframes typingBounce': {
              '0%, 60%, 100%': {
                transform: 'translateY(0)',
                opacity: 0.4,
              },
              '30%': {
                transform: 'translateY(-5px)',
                opacity: 1,
              },
            },
          }}
        />
      ))}
    </Box>
  );
};

// Modify TypedMessage component
const TypedMessage = ({ content, forceShow, onTypingComplete }) => {
  const [displayedContent, setDisplayedContent] = useState(forceShow ? content : '');
  const [isTyping, setIsTyping] = useState(!forceShow);
  const indexRef = useRef(0);
  const timeoutRef = useRef(null);
  const completedRef = useRef(false);
  const onTypingCompleteRef = useRef(onTypingComplete);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    onTypingCompleteRef.current = onTypingComplete;
  }, [onTypingComplete]);

  useEffect(() => {
    indexRef.current = 0;
    completedRef.current = false;
    setDisplayedContent('');

    if (forceShow) {
      setDisplayedContent(content);
      setIsTyping(false);
      if (!completedRef.current) {
        completedRef.current = true;
        onTypingCompleteRef.current?.();
      }
      return;
    }

    const typeNextCharacter = () => {
      if (indexRef.current < content.length && !isPaused) {
        indexRef.current += 1;
        setDisplayedContent(content.substring(0, indexRef.current));

        if (indexRef.current >= content.length) {
          setIsTyping(false);
          if (!completedRef.current) {
            completedRef.current = true;
            onTypingCompleteRef.current?.();
          }
          return;
        }

        timeoutRef.current = setTimeout(typeNextCharacter, 30);
      }
    };

    if (!isPaused) {
      typeNextCharacter();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (!completedRef.current) {
        completedRef.current = true;
        onTypingCompleteRef.current?.();
      }
    };
  }, [content, forceShow, isPaused]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 400 }}>
        {displayedContent}
      </Typography>
    </Box>
  );
};

// Custom hook to listen to host app's viewport information
const useHostViewport = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);
  const [isHostMobile, setIsHostMobile] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;

      try {
        let data = event.data;
        if (typeof data === 'string') {
          if (data.startsWith('{') || data.startsWith('[')) {
            data = JSON.parse(data);
          } else {
            return;
          }
        }
        if (data.type === 'VIEWPORT_INFO') {
          setIsHostMobile(data.isMobile);
        }
      } catch (error) {
      }
    };

    const requestViewportInfo = () => {
      if (window.parent !== window) {
        window.parent.postMessage(JSON.stringify({
          type: 'REQUEST_VIEWPORT_INFO'
        }), '*');
      }
    };

    window.addEventListener('message', handleMessage);
    requestViewportInfo();

    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return isHostMobile !== null ? isHostMobile : isMobile;
};

const Chat = () => {
  const saveChatState = (state) => {
    try {
      sessionStorage.setItem('chatState', JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save chat state to session storage:', error);
    }
  };

  const loadChatState = () => {
    try {
      const savedState = sessionStorage.getItem('chatState');
      return savedState ? JSON.parse(savedState) : null;
    } catch (error) {
      console.warn('Failed to load chat state from session storage:', error);
      return null;
    }
  };

  const clearChatState = () => {
    try {
      sessionStorage.removeItem('chatState');
    } catch (error) {
      console.warn('Failed to clear chat state from session storage:', error);
    }
  };

  const savedState = loadChatState();
  const [messages, setMessages] = useState(savedState?.messages || [initialBotMessage]);
  const [input, setInput] = useState(savedState?.input || '');
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(savedState?.showQuickReplies ?? true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(savedState?.sessionEnded ?? false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [initialWindowHeight] = useState(window.innerHeight);
  const inputRef = useRef(null);
  const [lastAnimatedBotMsgIndex, setLastAnimatedBotMsgIndex] = useState(null);
  const [isTypingResponse, setIsTypingResponse] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [savedSession, setSavedSession] = useState(null);
  const [isManualDelete, setIsManualDelete] = useState(false);

  useEffect(() => {
    const stateToSave = {
      messages,
      input,
      showQuickReplies,
      sessionEnded
    };
    saveChatState(stateToSave);
  }, [messages, input, showQuickReplies, sessionEnded]);

  useEffect(() => {
    if (window.parent !== window) {
      const timer = setTimeout(() => {
        window.parent.postMessage(JSON.stringify({
          type: 'CHAT_MINIMIZED',
          isMinimized: isMinimized
        }), '*');
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isMinimized]);

  useEffect(() => {
    if (window.parent !== window) {
      const timer = setTimeout(() => {
        window.parent.postMessage(JSON.stringify({
          type: 'CHAT_MINIMIZED',
          isMinimized: isMinimized
        }), '*');
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [isMinimized]);

  const isMobile = useHostViewport();

  const deleteSession = async () => {
    if (socket) {
      socket.emit('deleteSession', { sessionId: socket.id });
      socket.close();
      setSocket(null);
      setSessionEnded(true);
      if (window.parent !== window) {
        window.parent.postMessage(JSON.stringify({
          type: 'CHAT_MINIMIZED',
          isMinimized: true
        }), '*');
      }
      setTimeout(() => {
        setIsMinimized(true);
        setSavedSession(null);
        setMessages([initialBotMessage]);
        setShowQuickReplies(true);
        setInput('');
        if (isManualDelete) {
          clearChatState();
          setIsManualDelete(false);
        }
      }, 50);
    }
  };

  const startNewSession = () => {
    const savedState = loadChatState();
    let restoring = false;
    
    if (savedState && savedState.messages && savedState.messages.length > 1) {
      setMessages(savedState.messages);
      setShowQuickReplies(savedState.showQuickReplies);
      setInput(savedState.input || '');
      setSessionEnded(false);
      setIsMinimized(false);
      setSavedSession(null);
      setIsTyping(false);
      setIsTypingResponse(false);
      setLastAnimatedBotMsgIndex(null);
      setIsPaused(false);
      setError(null);
      restoring = true;
      setIsLoading(false);
    } else {
      setMessages([initialBotMessage]);
      setShowQuickReplies(true);
      setSessionEnded(false);
      setIsMinimized(false);
      setSavedSession(null);
      setInput('');
      setIsTyping(false);
      setIsTypingResponse(false);
      setLastAnimatedBotMsgIndex(null);
      setIsPaused(false);
      setError(null);
      setIsLoading(true);
    }

    const newSocket = io('https://vangelis-be-72a501737d30.herokuapp.com', {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    setSocket(newSocket);

    newSocket.on('connect', () => { 
      setIsLoading(false);
      newSocket.emit('startChat');
      console.log('Socket connected:', newSocket.id);
    });

    newSocket.on('connect_error', (error) => {
      setError('Failed to connect to the server. Please try again later.');
      setIsLoading(false);
      console.error('Socket connection error:', error);
    });

    newSocket.on('response', (data) => {
      console.log('Received assistant response:', data.message);
      setIsTypingResponse(true);
      setIsPaused(false);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    });

    newSocket.on('typing', (data) => {
      if (data.sessionId === 'assistant') {
        setIsTyping(true);
      }
      console.log('Received typing event:', data);
    });

    newSocket.on('stopTyping', (data) => {
      if (data.sessionId === 'assistant') {
        setIsTyping(false);
      }
      console.log('Received stopTyping event:', data);
    });

    newSocket.on('error', (data) => {
      setError(data.message || 'An error occurred');
      console.error('Socket error event:', data);
    });
  };

  const handleMinimize = () => {
    if (!sessionEnded) {
      setSavedSession({
        messages,
        showQuickReplies,
        socket
      });
    }
    if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify({
        type: 'CHAT_MINIMIZED',
        isMinimized: true
      }), '*');
    }
    setTimeout(() => {
      setIsMinimized(true);
    }, 50);
  };

  const handleMaximize = () => {
    startNewSession();
    
    if (window.parent !== window) {
      window.parent.postMessage(JSON.stringify({
        type: 'CHAT_MINIMIZED',
        isMinimized: false
      }), '*');
    }
    setTimeout(() => {
      setIsMinimized(false);
    }, 50);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      setLastAnimatedBotMsgIndex(messages.length - 1);
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && socket) {
      console.log('Sending message to backend:', input);
      socket.emit('message', { message: input });
      setMessages(prev => [...prev, { role: 'user', content: input }]);
      setInput('');
      setShowQuickReplies(false);
      setIsTyping(true);
      setLastAnimatedBotMsgIndex(null);
    }
  };

  const handleQuickReply = (reply) => {
    console.log('Quick reply clicked:', reply, 'Socket:', !!socket);
    if (socket) {
      console.log('Sending quick reply to backend:', reply);
      socket.emit('message', { message: reply });
      setMessages(prev => [...prev, { role: 'user', content: reply }]);
      setShowQuickReplies(false);
      setIsTyping(true);
      setLastAnimatedBotMsgIndex(null);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (socket) {
      socket.emit('typing');
    }

    typingTimeoutRef.current = setTimeout(() => {
      if (socket) {
        socket.emit('stopTyping');
      }
    }, 1000);
  };

  const handleCloseError = () => {
    setError(null);
  };

  useEffect(() => {
    const handleResize = () => {
      const newHeight = window.innerHeight;
      if (isMobile && initialWindowHeight - newHeight > 100) {
        setKeyboardVisible(true);
      } else {
        setKeyboardVisible(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initialWindowHeight, isMobile]);

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    setIsManualDelete(true);
    deleteSession();
    setDeleteDialogOpen(false);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  useEffect(() => {
    const handleMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'MAXIMIZE_CHAT') {
          console.log('Received maximize message');
          if (sessionEnded || !socket) {
            startNewSession();
          }
          setIsMinimized(false);
          if (window.parent !== window) {
            window.parent.postMessage(JSON.stringify({
              type: 'CHAT_MINIMIZED',
              isMinimized: false
            }), '*');
          }
        }
      } catch (error) {
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sessionEnded, socket]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (socket) {
        socket.close();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (socket) {
        socket.close();
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [socket]);

  if (!isVisible) return null;

  // Header bar with controls (refined for screenshot style)
  const HeaderBar = (
    <Box
      sx={{
        width: '100%',
        height: 56,
        background: '#f7f6f4',
        borderBottom: '1px solid #e0e0e0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        gap: 1,
        borderTopLeftRadius: isMobile ? 16 : 16,
        borderTopRightRadius: isMobile ? 16 : 16,
      }}
    >
      {/* Πλαίσιο 1: Avatar + Τίτλος
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          background: '#fff',
          borderRadius: '12px',
          px: 1.2,
          py: 0.6,
        }}
      >
        <img
          src="/Gruppo_IQ.jpg"
          alt="Assistant Icon"
          style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
        />
        <Typography
          variant="subtitle1"
          sx={{
            fontWeight: 600,
            fontSize: '0.9rem',
            color: '#a1a1',
            whiteSpace: 'nowrap',
          }}
        >
          Gruppo IQ
        </Typography>
      </Box> */}
            {/* Τίτλος - χωρίς πλαίσιο */}
      
      <img
          src="/Avatar.png"
          alt="Assistant Icon"
          style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover' }}
        />
      <Typography
        variant="subtitle1"
        sx={{
          fontWeight: 600,
          fontSize: '0.95rem',
          color: '#1a1a1a',
          fontStyle: 'italic',
          whiteSpace: 'nowrap',
        }}
      >
        Gruppo IQ
      </Typography>
        
      <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
        {/* Πλαίσιο 2: Minimize */}
        <IconButton
          size="small"
          onClick={handleMinimize}
          sx={{
            background: '#1a1a1a',
            border: '1px solid #000',
            borderRadius: '12px',
            color: 'rgba(255,255,255,0.85)',
            width: 36,
            height: 36,
            '&:hover': {
              background: '#000',
              color: '#fff',
            },
          }}
        >
          <RemoveIcon fontSize="small" />
        </IconButton>

        {/* Πλαίσιο 3: Delete */}
        <IconButton
          size="small"
          onClick={handleDeleteClick}
          sx={{
            background: '#1a1a1a',
            border: '1px solid #000',
            borderRadius: '12px',
            color: 'rgba(255,255,255,0.85)',
            width: 36,
            height: 36,
            '&:hover': {
              background: '#000',
              color: '#fff',
            },
          }}
        >
          <DeleteIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );

  if (isMinimized) {
    return (
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          right: 0,
          zIndex: 1300,
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
          background: 'transparent',
        }}
        onClick={handleMaximize}
        style={{ cursor: 'pointer' }}
      >
        <Fab
          color="primary"
          sx={{
            bgcolor: '#fff',
            '&:hover': {
              bgcolor: '#fff',
            },
            width: '100%',
            height: '100%',
            minHeight: '100%',
            minWidth: '100%',
            boxShadow: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 0,
            m: 0,
            borderRadius: '50%',
          }}
        >
        <img
          src="/Avatar.png"
          alt="Agent Bot"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            borderRadius: '50%'
          }}
        />
        </Fab>
      </Box>
    );
  }

  if (isLoading && (!messages || messages.length <= 1)) {
    return <div style={{ width: '100vw', height: '100vh', background: '#fff' }} />;
  }

  console.log('Rendering messages:', messages);
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'transparent',
      }}
    >
      <Container maxWidth="md" sx={{ p: 0, height: '100%', width: '100%' }}>
        <Paper 
          elevation={3} 
          sx={{ 
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 0,
            overflow: 'hidden',
            fontSize: '0.95rem',
            position: 'relative',
            m: 0,
            background: '#f7f6f4',            
          }}
        >
          {HeaderBar}
          <Box sx={{ 
            flex: 1, 
            minHeight: 0,
            overflowY: 'auto', 
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            background: 'transparent',
          }}>
            {messages.filter(m => m && m.content).map((message, index) => {
              const isInitialBotMessage = index === 0 && message.role === 'assistant';
              const isLastAssistantMessage = message.role === 'assistant' && index === messages.length - 1;
              return (
                <React.Fragment key={index}>

                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
                      mb: 2,
                    }}
                  >
                    <Paper
                      elevation={0}
                      sx={{
                        p: isInitialBotMessage ? 2 : 1.5,
                        maxWidth: '90%',
                        backgroundColor: message.role === 'user' ? '#1a1a1a' : '#ffffff',
                        color: message.role === 'user' ? '#ffffff' : '#1e293b',
                        borderRadius: message.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: isInitialBotMessage ? 1.5 : 1,
                        boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
                        fontSize: '0.85rem',
                        fontWeight: isInitialBotMessage ? 500 : 400,
                      }}
                    >
                      {message.role === 'assistant'
                        ? (isLastAssistantMessage && isTypingResponse
                            ? <TypedMessage 
                                content={message.content} 
                                forceShow={false} 
                                onTypingComplete={() => {
                                  setIsTypingResponse(false);
                                  setIsTyping(false);
                                }}
                              />
                            : <Typography sx={{ fontSize: '0.85rem', fontWeight: isInitialBotMessage ? 500 : 400, color: '#1e293b' }}>
                                {message.content}
                              </Typography>
                          )
                        : <Typography sx={{ fontSize: '0.85rem', color: '#ffffff' }}>{message.content}</Typography>
                      }
                    </Paper>
                  </Box>

                  {isInitialBotMessage && showQuickReplies && (
                    <Box sx={{ mb: 2 }}>
                      <Typography sx={{ mb: 0.5, fontSize: '0.9rem', color: '#888', fontWeight: 500 }}>
                      Αυτές είναι οι πιο συχνές ερωτήσεις:
                      </Typography>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {quickReplies.map((reply, i) => (
                          <Button
                            key={i}
                            variant="outlined"
                            fullWidth
                            onClick={() => handleQuickReply(reply)}
                            disabled={!socket}

                            startIcon={
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 12,
                                  height: 12,
                                  borderRadius: '50%',
                                  background: '#1a1a1a',
                                  flexShrink: 0,
                                }}
                              >
                                <AddIcon sx={{ fontSize: '18px', color: '#fff' }} />
                              </Box>
                            }

                            endIcon={
                              <PlayArrowIcon
                                sx={{
                                  fontSize: '15px',
                                  color: '#9a9a9a',
                                  transition: 'color 0.2s ease',
                                }}
                              />
                            }

                            sx={{
                              width: '100%',
                              boxSizing: 'border-box',
                              px: '14px',
                              py: '7px',
                              minHeight: '34px',
                              borderRadius: '12px',
                              border: '1px solid #ececec',
                              background: '#ffffff',
                              color: '#1a1a1a',
                              fontFamily: "'Outfit', sans-serif",
                              fontSize: '0.82rem',
                              fontWeight: 500,
                              lineHeight: 1.3,
                              textTransform: 'none',
                              textAlign: 'left',
                              justifyContent: 'flex-start',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.8) inset',
                              transition:
                                'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
                              '& .MuiButton-startIcon': {
                                marginLeft: 0,
                                marginRight: '10px',
                                flexShrink: 0,
                              },
                              '& .MuiButton-startIcon svg': {
                                fontSize: '15px',
                                width: '12px',
                                height: '12px',
                              },
                              '& .MuiButton-endIcon': {
                                marginLeft: 'auto',
                                marginRight: 0,
                                flexShrink: 0,
                              },
                              '&:hover': {
                                borderColor: '#d0d0d0',
                                transform: 'translateY(-2px)',
                                boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
                                '& .MuiButton-endIcon svg': {
                                  color: '#1a1a1a',
                                },
                              },
                            }}
                          >
                            {reply}
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  )}
                </React.Fragment>
              );
            })}
            {isTyping && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'flex-start',
                  mb: 2,
                }}
              >
                <Paper elevation={0} sx={{ p: 1.5, backgroundColor: '#f5f5f5', borderRadius: 3 }}>
                  <TypingIndicator />
                </Paper>
              </Box>
            )}
            <div ref={messagesEndRef} />
          </Box>
          {/* Input area */}
          <Box sx={{ 
            p: 2, 
            background: '#f7f6f4',
            position: isMobile ? 'sticky' : 'relative',
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                inputRef={inputRef}
                fullWidth
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Πληκτρολογήστε το μήνυμά σας..."
                variant="outlined"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '24px',
                    background: '#fff',
                    border: '1px solid #ddd',
                    fontSize: '1rem',
                    paddingRight: 0,
                    height: 44,
                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                    '&:hover': {
                      borderColor: '#bbb',
                    },
                    '&.Mui-focused': {
                      background: '#fff',
                      borderColor: '#1a1a1a',
                      boxShadow: '0 0 0 2px rgba(0,0,0,0.12)',
                    },
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    border: 'none',
                  },
                  '& input': {
                    padding: '12px 18px',
                  },
                  minWidth: 0,
                  flex: 1,
                }}
                InputProps={{
                  style: { height: 44 }
                }}
              />
              <Button
                variant="contained"
                onClick={handleSend}
                disabled={!input.trim() || isTypingResponse}
                sx={{
                  minWidth: 44,
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  padding: 0,
                  background: '#1a1a1a',
                  color: '#fff',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '1rem',
                  '&:hover': {
                    background: '#000',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.45)',
                  },
                  '&.Mui-disabled': {
                    background: '#d0d0d0',
                    color: '#fff',
                    boxShadow: 'none',
                  }
                }}
              >
                <SendIcon sx={{ fontSize: 20 }} />
              </Button>
            </Box>

            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: 0.1
            }}>
            </Box>
          </Box>
        </Paper>
        
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          PaperProps={{
            sx: {
              borderRadius: '18px',
              width: 'calc(100% - 32px)',
              maxWidth: '380px',
              p: 1,
              boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
            }
          }}
        >
          <DialogTitle
            sx={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#0d3b52',
              pb: 1,
            }}
          >
            Κλείσιμο συνομιλίας;
          </DialogTitle>

          <DialogContent>
            <Typography
              sx={{
                fontSize: '0.9rem',
                color: '#5f6b73',
                lineHeight: 1.55,
              }}
            >
              Θέλεις σίγουρα να κλείσεις τη συνομιλία;
              Το ιστορικό της συνομιλίας θα διαγραφεί.
            </Typography>
          </DialogContent>

          <DialogActions
            sx={{
              px: 3,
              pb: 2,
              gap: 1,
            }}
          >
            <Button
              onClick={handleDeleteCancel}
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                color: '#52616b',
                px: 2.5,
                fontWeight: 600,
              }}
            >
              Ακύρωση
            </Button>

            <Button
              onClick={handleDeleteConfirm}
              variant="contained"
              sx={{
                borderRadius: '999px',
                textTransform: 'none',
                px: 2.5,
                fontWeight: 600,
                bgcolor: '#0d3b52',
                boxShadow: 'none',

                '&:hover': {
                  bgcolor: '#092c3d',
                  boxShadow: 'none',
                },
              }}
            >
              Κλείσιμο
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default Chat;