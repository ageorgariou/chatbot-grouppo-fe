import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import CssBaseline from '@mui/material/CssBaseline';
import Chat from './components/Chat';

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
    },
    background: {
      default: '#f5f5f5',
    },
  },
});

function App() {
  // Detect widget mode from URL
  const urlParams = new URLSearchParams(window.location.search);
  const widgetMode = urlParams.get('mode') === 'widget';

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Chat widgetMode={widgetMode} />
    </ThemeProvider>
  );
}

export default App;
 