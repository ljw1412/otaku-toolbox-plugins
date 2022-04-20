const fs = require('fs')
const path = require('path')

const options = ['data', 'v2']

function clean() {
  options.forEach((name) => {
    const list = []
    const dir = path.join(__dirname, name)
    const fileList = fs.readdirSync(dir)
    fileList.forEach((filename) => {
      const filePath = path.join(dir, filename)
      const data = require(filePath)
      if (!data.title) {
        fs.rmSync(filePath)
        console.log('[删除无效文件]', filePath)
      } else {
        list.push({ id: data.id, title: data.title, cover: data.cover })
      }
    })
    fs.writeFileSync(
      path.join(__dirname, `${name}.json`),
      JSON.stringify({ list, backupTime: 1620974880000 })
    )
  })
}

clean()
