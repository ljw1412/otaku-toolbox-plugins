const { glob } = require('glob')
const { join } = require('path')
const fs = require('fs')
const only = require('only')

const RELEASE_DIR = join(__dirname, 'release')
const PLUGINS_DIR = join(RELEASE_DIR, 'plugins')

function createPluginList() {
  const files = glob.sync(`${PLUGINS_DIR}/**/config.json`)
  console.log(files)
  const list = files.map((file) => {
    const config = require(file)
    return only(config, 'plugin icon name desc version config css')
  })
  fs.writeFileSync(join(PLUGINS_DIR, 'list.json'), JSON.stringify(list))
}

const acgNames = ['news', 'anime', 'comic', 'game']

function createACGRuleList(type) {
  const ACG_DIR = join(RELEASE_DIR, type)
  const files = glob.sync(`${ACG_DIR}/!(list).json`)
  fs.mkdirSync(ACG_DIR, { recursive: true })
  const list = files.map((file) => {
    const config = require(file)
    return only(config, 'name namespace icon url type version')
  })
  console.log(list)
  fs.writeFileSync(
    join(ACG_DIR, 'list.json'),
    JSON.stringify(list.filter((item) => item.version !== -999))
  )
}

createPluginList()

acgNames.forEach((name) => {
  createACGRuleList(name)
})
