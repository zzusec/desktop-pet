// 预加载脚本:在隔离的安全环境里,把有限的几个能力暴露给渲染层。
// 渲染层只能通过 window.petAPI 调用这些方法,拿不到完整的 Node / Electron API。

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('petAPI', {
  // 切换窗口鼠标穿透:ignore=true 穿透(点击落到下面的应用),false 捕获(可与小狮子互动)
  setIgnoreMouse: (ignore) => ipcRenderer.send('set-ignore-mouse', Boolean(ignore)),

  // 请求弹出原生右键菜单
  showMenu: () => ipcRenderer.send('show-menu'),

  // 退出应用
  quit: () => ipcRenderer.send('quit-app'),

  // 告知主进程当前是否处于专注模式(用于右键菜单切换「开始/结束专注」)
  setFocusing: (v) => ipcRenderer.send('set-focusing', Boolean(v)),

  // 告知主进程当前氛围特效(用于右键子菜单勾选当前项)
  setFx: (type) => ipcRenderer.send('set-fx', String(type)),

  // 订阅右键菜单里的动作(feed / pet / sleep / come)
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action))
  },
})
