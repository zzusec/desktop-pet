// 开发验证用:对指定动作在多个时间点离屏截图,存成 _shot_<action>_<ms>.png。
// 不影响正式运行,也不打包(不在 package.json build.files 里)。
// 用法: npx electron capture.js yawn think eat angry peek sneeze shy
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

const actions = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const FRAMES = [300, 800, 1500, 2300] // 截图时间点(ms),覆盖动作不同阶段

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 440,
    height: 560,
    x: -4000, // 屏幕外,不打扰
    y: 100,
    show: true,
    backgroundColor: '#bfe0f5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  await win.loadFile('_preview.html')
  await new Promise((r) => setTimeout(r, 800))
  // 放大、居中,方便看清动作细节
  await win.webContents.executeJavaScript(`(function(){
    const p = window.__pet; p.lion.size = 1.5; p.__cx = window.innerWidth/2; p.lion.x = p.__cx;
  })()`)

  for (const action of actions) {
    // 复位到干净的 idle 再触发,隔离上一个动作
    await win.webContents.executeJavaScript(`(function(){
      const p = window.__pet, l = p.lion;
      l.state='idle'; l.stateTime=0; l.onGround=true; l.vy=0; l.x=p.__cx;
      l.idleTimer=999; l.bodyTilt=0; l.headTilt=0;
    })()`)
    await win.webContents.executeJavaScript(`window.__pet[${JSON.stringify(action)}] && window.__pet[${JSON.stringify(action)}]()`)
    let last = 0
    for (const t of FRAMES) {
      await new Promise((r) => setTimeout(r, t - last))
      last = t
      // 清掉对话气泡,露出头顶符号;并回报当前状态用于诊断
      const st = await win.webContents.executeJavaScript(`(function(){ const l=window.__pet.lion; l.bubbleText=''; l.bubbleUntil=0; return l.state+' food='+(l.foodT||0).toFixed(2); })()`)
      console.log(`  ${action}@${t}ms -> ${st}`)
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(__dirname, `_shot_${action}_${t}.png`), img.toPNG())
    }
  }
  console.log('CAPTURE_DONE ' + actions.join(','))
  app.quit()
})
