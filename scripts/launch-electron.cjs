const { spawn } = require('child_process')
const path = require('path')

const electronPath = require('electron')
const appDir = path.join(__dirname, '..')
const env = { ...process.env, VITE_DEV_SERVER_URL: 'http://localhost:5173' }
delete env.ELECTRON_RUN_AS_NODE

spawn(electronPath, [appDir], {
  stdio: 'inherit',
  env,
  cwd: appDir,
}).on('exit', (code) => process.exit(code ?? 0))
