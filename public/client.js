{
  'use strict'

  let $time = document.getElementById('time')

  let updateTime = () => {
    $time.textContent = new Date().toLocaleTimeString(navigator.language)
  }

  setInterval(updateTime, 1000)
  updateTime()
}
