import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App.tsx'
import { createAndroidApplicationPort } from './android-application.ts'
import { createAndroidOrderReminderController } from './android-order-notifications.ts'
import { createWebApplicationPort } from './web-application.ts'
import './styles.css'
import './calendar.css'
import './data-entry.css'

const applicationPort = Capacitor.getPlatform() === 'android'
  ? createAndroidApplicationPort()
  : createWebApplicationPort()
const orderReminderController = Capacitor.getPlatform() === 'android'
  ? createAndroidOrderReminderController()
  : undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App applicationPort={applicationPort} orderReminderController={orderReminderController} />
  </React.StrictMode>,
)
