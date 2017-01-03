"use strict";

/**
 * Module dependencies && configure
 * @type {*|exports|module.exports}
 */

const mongojs = require("mongojs");
const MongoOplog = require("mongo-oplog");
const mongo = require("mongodb"); //use for convert Timestamp Bson type
const async = require("async");
const redis = require("redis");
const client = redis.createClient(); //use for save sync doc's timestamp
const onlineMongoUrl = "mongodb://yourusername:yourpassword@ecs.aliyun.mongo.mapping.com:3717/local?authSource=admin";
const localDb = mongojs('localhost:27017/Onions'); //local mongodb

/**
 * 当获取一条oplog后,截取ts参数并写入到redis,作为tail的since参数初始值
 *
 * @param <BSON Timestamp>timestamp
 * @ref https://mongodb.github.io/node-mongodb-native/api-bson-generated/timestamp.html
 */
function redisHandleTimestamp(timestamp) {

    var lowTs = timestamp.getLowBits();
    var highTs = timestamp.getHighBits();
    var setValue = lowTs + "-" + highTs;
    client.set("timestamp", setValue);

}


/**
 * 传入oplog实例并开始tailling,依据同步oplog中的op参数判断增删改查
 *
 * @param <mongo-oplog instance> oplog
 * @ref oplog: https://github.com/cayasso/mongo-oplog
 * @ref CRUD: https://github.com/mafintosh/mongojs
 */
function optail(oplog) {

    oplog.tail(function (err) {
        if (err) throw err;

        oplog.on('op', data => {

            console.log(data);
            redisHandleTimestamp(data.ts);
            var collName = data.ns.split(".")[1];
            var switchFlag = data.op;

            switch(switchFlag) {
                case "i": //insert
                    localDb[collName].insert(data.o);
                    break;
                case "u": //update
                    localDb[collName].update(data.o2, data.o);
                    break;
                case "d": //delete(remove)
                    localDb[collName].remove(data.o);
                    break;
            }

        });
    });

    /**
     *  response when first connect failed
     *  and connection local to remote server closed
     *  and local mongo server stoped
     */
    oplog.on('error', error => {
        throw new Error(error)
    });

}


/**
 * 入口函数
 * 从redis获取since初始值后开始执行oplog tail
 */
function initOplogSync() {

    async.waterfall([
        function (callback) {
            console.log("> Fetch last sync document timestamp");
            var lowTs = 0;
            var highTs = 0;
            var timestamp = {};
            client.get("timestamp", function (err, reply) {
                lowTs = reply.split("-")[0];
                highTs = reply.split("-")[1];
                timestamp.low = lowTs;
                timestamp.high = highTs;
                callback(null, timestamp);
            })
        },
        function (timestamp, callback) {
            console.log("> Initial oplog instance ");
            var oplog = MongoOplog(
                onlineMongoUrl,
                { since: mongo.Timestamp(timestamp.low, timestamp.high) }
            );
            callback(null, oplog);
        },
        function (oplog, callback) {
            console.log("> calling oplog tail");
            optail(oplog);
            callback(null, 'done');
        }
    ], function (err, result) {
    });

}

try {
    /**
     * 程序初始化开始,redis的timestamp应该是
     * 0-0 表示程序第一次启动,从当前开始做since
     * 任意数-任意数 表示程序崩溃后重新启动,从上次失败的开始做since
     * 实际环境中同步: 1.mongodump db with oplog 2. restore db and oplog 3. add last oplog into redis `timestamp`
     */
    initOplogSync();
} catch (err) {
    console.error(err);
}
