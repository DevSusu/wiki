'use strict'

/* global wiki */

const fs = require('fs')
const path = require('path')
const _ = require('lodash')
const Promise = require('bluebird')

/**
 * PostgreSQL DB module
 */
module.exports = {

  Sequelize: require('sequelize'),

  /**
   * Initialize DB
   *
   * @return     {Object}  DB instance
   */
  init() {
    let self = this

    let dbModelsPath = path.join(wiki.SERVERPATH, 'models')

    // Define Sequelize instance

    self.inst = new self.Sequelize(wiki.config.db.db, wiki.config.db.user, wiki.config.db.pass, {
      host: wiki.config.db.host,
      port: wiki.config.db.port,
      dialect: 'postgres',
      pool: {
        max: 10,
        min: 0,
        idle: 10000
      },
      logging: false
    })

    // Attempt to connect and authenticate to DB

    self.inst.authenticate().then(() => {
      wiki.logger.info('Database (PostgreSQL) connection: OK')
    }).catch(err => {
      wiki.logger.error('Failed to connect to MongoDB instance.')
      return err
    })

    // Load DB Models

    fs
      .readdirSync(dbModelsPath)
      .filter(function (file) {
        return (file.indexOf('.') !== 0 && file.indexOf('_') !== 0)
      })
      .forEach(function (file) {
        let modelName = _.upperFirst(_.camelCase(_.split(file, '.')[0]))
        self[modelName] = self.inst.import(path.join(dbModelsPath, file))
      })

    // Associate DB Models

    require(path.join(dbModelsPath, '_relations.js'))(self)

    // Set init tasks

    let initTasks = {
      // -> Sync DB Schemas
      syncSchemas() {
        return self.inst.sync({
          force: false,
          logging: false
        })
      },
      // -> Set Connection App Name
      setAppName() {
        return self.inst.query(`set application_name = 'Wiki.js'`, { raw: true })
      }
    }

    let initTasksQueue = (wiki.IS_MASTER) ? [
      initTasks.syncSchemas,
      initTasks.setAppName
    ] : [
      initTasks.setAppName
    ]

    // Perform init tasks

    self.onReady = Promise.each(initTasksQueue, t => t())

    return self
  }

}
