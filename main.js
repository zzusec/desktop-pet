// 桌面小狮子 —— Electron 主进程
// 创建一个铺满整个屏幕的「透明 / 无边框 / 置顶」窗口,
// 小狮子在这个窗口里活动,看起来就像直接趴在桌面上、叠在所有应用之上。
//
// 关键技巧:窗口默认「鼠标穿透」(点击会落到下面的应用),
// 只有当鼠标移到小狮子身上时,渲染层才通过 IPC 请求临时关闭穿透,
// 这样既能跟小狮子互动,又完全不挡住你操作其它窗口。

const { app, BrowserWindow, ipcMain, screen, Menu, globalShortcut } = require('electron')
const path = require('path')

/** @type {BrowserWindow | null} */
let win = null
let focusing = false // 渲染层回传的专注状态,决定右键菜单显示「开始/结束专注」
let currentFx = 'none' // 渲染层回传的当前氛围特效,用于右键子菜单勾选

function createWindow() {
  const primary = screen.getPrimaryDisplay()
  const { x, y, width, height } = primary.bounds

  win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    // 全屏透明覆盖层,不要有标题栏背景
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })

  // 置于最顶层(连屏保 / 全屏应用之上),并在所有桌面空间可见
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // 默认整窗鼠标穿透;forward:true 让鼠标移动事件仍转发给渲染层做命中检测
  win.setIgnoreMouseEvents(true, { forward: true })

  win.loadFile('index.html')

  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools({ mode: 'detach' })
  }

  win.on('closed', () => {
    win = null
  })
}

// 渲染层根据「鼠标是否在小狮子身上」请求开/关穿透
ipcMain.on('set-ignore-mouse', (_event, ignore) => {
  if (!win) return
  if (ignore) {
    win.setIgnoreMouseEvents(true, { forward: true })
  } else {
    win.setIgnoreMouseEvents(false)
  }
})

// 渲染层回传专注状态
ipcMain.on('set-focusing', (_event, v) => {
  focusing = !!v
})

// 渲染层回传当前氛围特效
ipcMain.on('set-fx', (_event, t) => {
  currentFx = t
})

// 右键小狮子时弹出的原生菜单
ipcMain.on('show-menu', () => {
  if (!win) return
  // 专注中显示「结束专注」,否则显示可选时长的子菜单
  const focusItem = focusing
    ? { label: '⏳  结束专注', click: () => win && win.webContents.send('menu-action', 'focus') }
    : {
        label: '⏳  一起专注',
        submenu: [
          { label: '5 分钟(小憩)', click: () => win && win.webContents.send('menu-action', 'focus:5') },
          { label: '15 分钟', click: () => win && win.webContents.send('menu-action', 'focus:15') },
          { label: '25 分钟(番茄钟)', click: () => win && win.webContents.send('menu-action', 'focus:25') },
        ],
      }
  const menu = Menu.buildFromTemplate([
    { label: '🍖  喂食', click: () => win && win.webContents.send('menu-action', 'feed') },
    { label: '🤚  摸摸头', click: () => win && win.webContents.send('menu-action', 'pet') },
    { label: '😴  让它睡觉', click: () => win && win.webContents.send('menu-action', 'sleep') },
    { label: '🎯  叫它过来', click: () => win && win.webContents.send('menu-action', 'come') },
    focusItem,
    { type: 'separator' },
    { label: '🕺  跳个舞', click: () => win && win.webContents.send('menu-action', 'dance') },
    { label: '🤸  打个滚', click: () => win && win.webContents.send('menu-action', 'roll') },
    { label: '🏃  追我玩', click: () => win && win.webContents.send('menu-action', 'chase') },
    { label: '🎾  丢飞盘给它捡', click: () => win && win.webContents.send('menu-action', 'fetch') },
    { label: '💕  比心', click: () => win && win.webContents.send('menu-action', 'loveyou') },
    { type: 'separator' },
    { label: '😤  生气', click: () => win && win.webContents.send('menu-action', 'angry') },
    { label: '👣  跺脚', click: () => win && win.webContents.send('menu-action', 'stomp') },
    { label: '🤔  歪头思考', click: () => win && win.webContents.send('menu-action', 'think') },
    { label: '🥱  打哈欠', click: () => win && win.webContents.send('menu-action', 'yawn') },
    { label: '🎩  换配饰(帽/镜/巾…)', click: () => win && win.webContents.send('menu-action', 'hat') },
    { label: '🔊  音效开/关', click: () => win && win.webContents.send('menu-action', 'sound') },
    {
      label: '✨  氛围特效',
      submenu: [
        { label: '关闭', type: 'radio', checked: currentFx === 'none', click: () => win && win.webContents.send('menu-action', 'fx:none') },
        { label: '下雪 ❄️', type: 'radio', checked: currentFx === 'snow', click: () => win && win.webContents.send('menu-action', 'fx:snow') },
        { label: '下雨 🌧️', type: 'radio', checked: currentFx === 'rain', click: () => win && win.webContents.send('menu-action', 'fx:rain') },
        { label: '落叶 🍂', type: 'radio', checked: currentFx === 'leaf', click: () => win && win.webContents.send('menu-action', 'fx:leaf') },
        { label: '花瓣 🌸', type: 'radio', checked: currentFx === 'petal', click: () => win && win.webContents.send('menu-action', 'fx:petal') },
        { label: '星空 ✨', type: 'radio', checked: currentFx === 'star', click: () => win && win.webContents.send('menu-action', 'fx:star') },
        { label: '萤火虫 ✨', type: 'radio', checked: currentFx === 'firefly', click: () => win && win.webContents.send('menu-action', 'fx:firefly') },
      ],
    },
    { label: '📊  状态面板(心情/饱/亲密)', click: () => win && win.webContents.send('menu-action', 'stats') },
    { label: '🐾  换个动物(狮/猫/狗/兔/熊猫)', click: () => win && win.webContents.send('menu-action', 'species') },
    { label: '➕  再养一只', click: () => win && win.webContents.send('menu-action', 'addpet') },
    { label: '➖  赶走一只', click: () => win && win.webContents.send('menu-action', 'removepet') },
    { type: 'separator' },
    { label: '❌  退出', click: () => app.quit() },
  ])
  menu.popup({ window: win })
})

ipcMain.on('quit-app', () => app.quit())

// 注册系统级全局快捷键(应用不在前台也能用)
function registerShortcuts() {
  const map = {
    'CommandOrControl+Shift+D': 'dance',
    'CommandOrControl+Shift+L': 'loveyou',
    'CommandOrControl+Shift+K': 'come',
    'CommandOrControl+Shift+J': 'roll',
  }
  for (const key of Object.keys(map)) {
    try {
      globalShortcut.register(key, () => win && win.webContents.send('menu-action', map[key]))
    } catch (e) {
      // 该组合被系统/其它应用占用时跳过
    }
  }
}

app.whenReady().then(() => {
  createWindow()
  registerShortcuts()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())

// 桌面宠物常驻:即便没有可见窗口也保持运行(macOS 习惯),
// 用户通过小狮子右键菜单或 Cmd+Q 退出。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
