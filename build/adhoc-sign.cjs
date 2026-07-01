// electron-builder afterSign hook.
//
// We ship an UNSIGNED build (no Apple Developer cert — see package.json mac.identity: null
// and docs/t3-and-packaging). But Apple Silicon requires every executable to carry at least
// an ad-hoc code signature, and electron-builder's "skipped signing" leaves the .app bundle
// unsealed (Identifier=Electron, CodeResources missing) — which makes macOS refuse to launch
// it as "damaged" even via right-click → Open.
//
// An ad-hoc signature (`codesign --sign -`) needs NO certificate, so it's fully compatible
// with a cert-less machine, and it seals the bundle so the local right-click-Open flow works.
// This runs after electron-builder's own (skipped) signing and before the dmg/zip are built,
// so both artifacts contain the ad-hoc-signed app. Proper Developer ID signing + notarization
// is the separate P2 work.
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterSign(context) {
  const { appOutDir, packager } = context
  const appName = packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`  • ad-hoc signing (no cert)  app=${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' }
  )
  // Sanity: the bundle should now verify against its own ad-hoc seal.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' })
  console.log('  • ad-hoc signature verified')
}
