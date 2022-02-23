const { glob } = require('glob')
const { join } = require('path')
const fs = require('fs')
const only = require('only')

const PLUGINS_DIR = join(__dirname, 'plugins')

function createPluginList() {
  const files = glob.sync(`${PLUGINS_DIR}/**/config.json`)
  console.log(files)
  const list = files.map((file) => {
    const config = require(file)
    return only(config, 'plugin icon name desc version config css')
  })
  fs.writeFileSync(
    join(PLUGINS_DIR, 'list.json'),
    JSON.stringify(list, null, 2)
  )
}

createPluginList()
