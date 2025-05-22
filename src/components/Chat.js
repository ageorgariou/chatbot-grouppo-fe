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
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => {
        if (prev.length >= 3) return '';
        return prev + '.';
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
      }}
    >
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 400 }}>typing</Typography>
      <Typography sx={{ minWidth: '24px' }}>{dots}</Typography>
    </Box>
  );
};

// Modify TypedMessage component
const TypedMessage = ({ content, forceShow, onTypingComplete }) => {
  const [displayedContent, setDisplayedContent] = useState(forceShow ? content : '');
  const [isTyping, setIsTyping] = useState(!forceShow);
  const indexRef = useRef(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    // Reset index when content changes
    indexRef.current = 0;
    setDisplayedContent('');
    
    if (forceShow) {
      setDisplayedContent(content);
      setIsTyping(false);
      onTypingComplete?.();
      return;
    }

    const typeNextCharacter = () => {
      if (indexRef.current < content.length && !isPaused) {
        setDisplayedContent(prev => content.substring(0, indexRef.current + 1));
        indexRef.current += 1;
        
        // Schedule next character
        setTimeout(typeNextCharacter, 30);
      } else if (indexRef.current >= content.length) {
        setIsTyping(false);
        onTypingComplete?.();
      }
    };

    // Start typing animation
    if (!isPaused) {
      typeNextCharacter();
    }
    
    return () => { /* cleanup if needed */ };
  }, [content, forceShow, isPaused, onTypingComplete]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 400 }}>
        {displayedContent}
      </Typography>
      {/* {!forceShow && (
        <IconButton 
          size="small" 
          onClick={() => setIsPaused(!isPaused)}
          sx={{ 
            color: isPaused ? '#8B5CF6' : '#888',
            '&:hover': { color: '#7C3AED' }
          }}
        >
          {isPaused ? <PlayArrowIcon /> : <PauseIcon />}
        </IconButton>
      )} */}
    </Box>
  );
};

// Custom hook to listen to host app's viewport information
const useHostViewport = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);
  const [isHostMobile, setIsHostMobile] = useState(null);

  useEffect(() => {
    // Listen for messages from host app
    const handleMessage = (event) => {
      // Only process messages from the expected origin
      if (event.origin !== window.location.origin) return;

      try {
        let data = event.data;
        if (typeof data === 'string') {
          // Only try to parse if it looks like JSON
          if (data.startsWith('{') || data.startsWith('[')) {
            data = JSON.parse(data);
          } else {
            return; // Ignore non-JSON strings
          }
        }
        if (data.type === 'VIEWPORT_INFO') {
          setIsHostMobile(data.isMobile);
        }
      } catch (error) {
        // Optionally: console.warn('Ignored non-JSON message', event.data);
      }
    };

    // Request viewport info from host app
    const requestViewportInfo = () => {
      if (window.parent !== window) {
        window.parent.postMessage(JSON.stringify({
          type: 'REQUEST_VIEWPORT_INFO'
        }), '*');
      }
    };

    window.addEventListener('message', handleMessage);
    requestViewportInfo();

    // Fallback to window resize if no host info is received
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 600);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Use host's mobile info if available, otherwise fallback to window width
  return isHostMobile !== null ? isHostMobile : isMobile;
};

const Chat = () => {
  const [messages, setMessages] = useState([initialBotMessage]);
  const [input, setInput] = useState('');
  const [socket, setSocket] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [initialWindowHeight] = useState(window.innerHeight);
  const inputRef = useRef(null);
  const [lastAnimatedBotMsgIndex, setLastAnimatedBotMsgIndex] = useState(null);
  const [isTypingResponse, setIsTypingResponse] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [savedSession, setSavedSession] = useState(null);

  // Use the custom hook instead of local state
  const isMobile = useHostViewport();

  const deleteSession = async () => {
    if (socket) {
      socket.emit('deleteSession', { sessionId: socket.id });
      socket.close();
      setSocket(null);
      setSessionEnded(true);
      setIsMinimized(true);
      setSavedSession(null);
    }
  };

  const startNewSession = () => {
    // Reset all state
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

    // Create new socket connection
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
    setIsMinimized(true);
  };

  const handleMaximize = () => {
    if (sessionEnded) {
      startNewSession();
    } else if (savedSession) {
      setMessages(savedSession.messages);
      setShowQuickReplies(savedSession.showQuickReplies);
      setSocket(savedSession.socket);
    }
    setIsMinimized(false);
  };

  useEffect(() => {
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

    // Add beforeunload event listener
    const handleBeforeUnload = () => {
      deleteSession();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      deleteSession();
      window.removeEventListener('beforeunload', handleBeforeUnload);
      newSocket.close();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    // Set the last bot message index to animate when a new assistant message arrives
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
      setLastAnimatedBotMsgIndex(null); // Stop animation for all bot messages
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
      setLastAnimatedBotMsgIndex(null); // Stop animation for all bot messages
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
    
    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Emit typing event
    if (socket) {
      socket.emit('typing');
    }

    // Set timeout to stop typing
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
      // If height decreased significantly from initial, keyboard is likely visible
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
    deleteSession();
    setDeleteDialogOpen(false);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  if (!isVisible) return null;

  // Header bar with controls (refined for screenshot style)
  const HeaderBar = (
    <Box
      sx={{
        width: '100%',
        height: 48,
        bgcolor: 'white',
        borderBottom: '1px solid #ececec',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        borderTopLeftRadius: isMobile ? 16 : 16,
        borderTopRightRadius: isMobile ? 16 : 16,
        fontSize: '1.1rem',
        fontWeight: 700,
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, fontSize: '1.1rem', color: '#222' }}>
      Gruppo IQ
      </Typography>
      <Box sx={{ display: 'flex', gap: 1.2, ml: 'auto' }}>
        {/* Minimize control */}
        <IconButton size="small" onClick={handleMinimize} sx={{ color: '#888' }}>
          <RemoveIcon fontSize="small" />
        </IconButton>
        {/* Delete session and minimize */}
        <IconButton size="small" onClick={handleDeleteClick} sx={{ color: '#888' }}>
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
          bottom: 20,
          right: 20,
          zIndex: 1300,
        }}
        onClick={handleMaximize}
        style={{ cursor: 'pointer' }}
      >
        <Fab
          color="primary"
          sx={{
            bgcolor: '#8B5CF6',
            '&:hover': {
              bgcolor: '#7C3AED',
            },
            width: 56,
            height: 56,
            minHeight: 56,
            minWidth: 56,
            boxShadow: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            p: 0,
          }}
        >
          <img
            src="/agent_bot.jpg"
            alt="Agent Bot"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%'
            }}
          />
        </Fab>
      </Box>
    );
  }

  if (isLoading) {
    return <LoadingSpinner />;
  }

  console.log('Rendering messages:', messages);
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 1300,
      }}
    >
      <Container maxWidth="md" sx={{ p: 0 }}>
        <Paper 
          elevation={3} 
          sx={{ 
            width: isMobile ? '100vw' : 420,
            height: isMobile ? '80vh' : 650,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: isMobile ? '16px 16px 0 0' : 4,
            overflow: 'hidden',
            fontSize: '0.95rem',
            position: isMobile ? 'fixed' : 'relative',
            top: isMobile ? 'auto' : 'auto',
            left: isMobile ? 0 : 'auto',
            right: isMobile ? 0 : 'auto',
            bottom: isMobile ? 0 : 'auto',
            m: isMobile ? 0 : 'auto',
            bgcolor: '#fff',
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
            bgcolor: '#fff',
          }}>
            {/* Initial assistant message with icon and style */}
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
                        backgroundColor: isInitialBotMessage ? '#f5f5f7' : (message.role === 'user' ? '#e3f2fd' : '#f5f5f5'),
                        borderRadius: 3,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: isInitialBotMessage ? 1.5 : 1,
                        boxShadow: isInitialBotMessage ? 1 : 0,
                        fontSize: '0.75rem',
                        fontWeight: isInitialBotMessage ? 500 : 400,
                      }}
                    >
                      {isInitialBotMessage && (
                        <img src="/agent_bot.jpg" alt="Assistant Icon" style={{ width: 28, height: 28, marginTop: 2, borderRadius: '50%' }} />
                      )}
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
                            : <Typography sx={{ fontSize: '0.75rem', fontWeight: isInitialBotMessage ? 500 : 400 }}>
                                {message.content}
                              </Typography>
                          )
                        : <Typography sx={{ fontSize: '0.75rem' }}>{message.content}</Typography>
                      }
                    </Paper>
                  </Box>
                  {/* Quick replies below initial message, above input */}
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
                            sx={{
                              borderRadius: 999,
                              textTransform: 'none',
                              fontWeight: 400,
                              fontSize: '0.75rem',
                              justifyContent: 'flex-start',
                              bgcolor: 'white',
                              border: '1.5px solid',
                              borderColor: '#e0e0e0',
                              color: '#222',
                              boxShadow: 'none',
                              px: 2.5,
                              py: 1.2,
                              minHeight: '38px',
                              transition: 'border-color 0.2s, color 0.2s, box-shadow 0.2s',
                              '&:hover, &:focus': {
                                borderColor: '#8B5CF6',
                                color: '#8B5CF6',
                                boxShadow: '0 0 0 2px #ede9fe',
                                background: '#faf8ff',
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
            bgcolor: '#fff', 
            borderTop: '1px solid #ececec',
            position: isMobile ? 'sticky' : 'relative',
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5
          }}>
            {/* Chatbotlogo above input */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1 }}>
              <a href="http://agenty.tech" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <img src="/chatbot_logo.png" alt="Chatbot Logo" style={{ height: 18, width: 'auto', display: 'block' }} />
              </a>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                inputRef={inputRef}
                fullWidth
                value={input}
                onChange={handleInputChange}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                variant="outlined"
                size="small"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '8px',
                    background: '#fff',
                    border: '1px solid #e0e0e0',
                    fontSize: '1rem',
                    paddingRight: 0,
                    height: 40,
                  },
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#e0e0e0',
                  },
                  '& input': {
                    padding: '10px 14px',
                  },
                  minWidth: 0,
                  flex: 1,
                }}
                InputProps={{
                  style: { height: 40 }
                }}
              />
              <Button
                variant="contained"
                onClick={handleSend}
                disabled={!input.trim() || isTypingResponse}
                sx={{
                  minWidth: 64,
                  height: 40,
                  borderRadius: '8px',
                  background: '#b5cdfa',
                  color: '#fff',
                  boxShadow: 'none',
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '1rem',
                  '&:hover': {
                    background: '#a4c3f7',
                    boxShadow: 'none',
                  },
                  '&.Mui-disabled': {
                    background: '#e3eefd',
                    color: '#fff',
                  }
                }}
              >
                Send
              </Button>
            </Box>
            {/* Footer disclaimer */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              gap: 0.1
            }}>
              {/* <Typography sx={{ fontSize: '0.8rem', color: '#aaa', textAlign: 'center' }}>
                AI may generate inaccurate information
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: '#8B5CF6', textAlign: 'center' }}>
                <a href="https://agenty.com" target="_blank" rel="noopener noreferrer" style={{ color: '#8B5CF6', textDecoration: 'none' }}>
                  Powered by Agenty
                </a>
              </Typography> */}
            </Box>
          </Box>
        </Paper>
        
        <Dialog
          open={deleteDialogOpen}
          onClose={handleDeleteCancel}
          aria-labelledby="delete-dialog-title"
          aria-describedby="delete-dialog-description"
        >
          <DialogTitle id="delete-dialog-title">
            Clear Chat History
          </DialogTitle>
          <DialogContent id="delete-dialog-description">
            <Typography>
              After clearing history you won't be able to access previous chats.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCancel} variant="outlined">Cancel</Button>
            <Button onClick={handleDeleteConfirm} variant="contained" color="error">
              Clear Chat
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
};

export default Chat; 