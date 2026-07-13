// Starts the Android app's Expo WEB build for browser-based self-QA.
// The native app renders the same screens via react-native-web, which lets
// the preview tooling click through and screenshot it without a phone.
// Native-only behavior (worklet scrub feel, haptics, keep-awake) still needs
// device testing — this catches runtime crashes, layout, data, and nav bugs.
import { spawn } from 'node:child_process';

const child = spawn('npx', ['expo', 'start', '--web', '--port', '8090'], {
    cwd: 'C:/Users/Michael/Desktop/Focus Reader Android',
    stdio: 'inherit',
    shell: true,
    // Don't pop a tab in the user's real browser — the preview tooling
    // attaches to localhost:8090 itself.
    env: { ...process.env, BROWSER: 'none', EXPO_NO_BROWSER: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
