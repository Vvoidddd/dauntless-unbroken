const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('lab',{action:(name,value)=>ipcRenderer.invoke('action',name,value),progress:fn=>ipcRenderer.on('progress',(_e,text)=>fn(text)),state:fn=>ipcRenderer.on('state',(_e,value)=>fn(value))});
