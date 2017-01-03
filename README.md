# ali-mongo-sync


### 工作原理

[ali-mongo] ---> [ecs + rinetd] ---> [redis record timestamp] ---> [mongo-oplog]

1. 使用`rinetd`在某一台`ECS`主机上把`阿里云MongoDB`端口映射到外网，从而保证在外网环境下可以访问线上的MongoDB。
2. 基于`mongo-oplog`的思想：使用MongoDB复制集的同步依据`oplog.rs`作为回放依据
3. 使用`redis`记录最新一次同步的oplog中的`ts`字段，目的是用到`mongo-oplog`中的`since`，`since`就是oplog的开始同步时间

### 基础环境

#### Step.1 线上MongoDB

详情参考[通过公网连接云数据库 MongoDB--ECS Linux 篇](https://help.aliyun.com/knowledge_detail/39952.html)

#### Step.2 Node.js环境

测试环境：

```shell
$ node -v
v6.4.0
$ npm -v
3.10.6
$ pm2 -v
[PM2] Spawning PM2 daemon
[PM2] PM2 Successfully daemonized
1.1.3
```

启动前需要配置`app.js`中的线上、线下的Mongo URI地址：

```javascript
const onlineMongoUrl = "mongodb://yourusername:yourpassword@ecs.aliyun.mongo.mapping.com:3717/local?authSource=admin";
const localDb = mongojs('localhost:27017/Onions'); //local mongodb
```

跑`app.js`的时候建议使用pm2(`pm2 start app.js`)

#### Step.3 Redis环境

Mac下使用`brew install redis`，没有做特殊设置直接启动：

```shell
$ redis-server
```

#### Step.4 本地MongoDB

测试时没有做特殊设置直接启动：
```shell
$ sudo mongod
```

### 第一次启动

第一次启动时候需要，设置redis中的timestamp为`0-0`：

```
127.0.0.1:6379> set timestamp "0-0"
OK
```

程序启动后会读取`timestamp`作为`mongo-oplog`的`since`值，`0-0`表示从0开始同步。

### 崩溃后启动

如果程序崩溃后再次启动时候，`app.js`会检查`redis`中的`timestamp`，以获取的`timestamp`作为`since`开始同步：

```
127.0.0.1:6379> get timestamp
"1-1483417098"
```

### 基于某一次特定时间启动

工作原理大概是：dump库的时候顺便把oplog也同时拿下来，然后restore后看最后一条oplog的`ts`值，然后手工填到`redis`的`timestamp`中。这样在启动程序的时候，就会按照特定的ts时间开始同步了。

[mongodump参考链接](https://docs.mongodb.com/manual/tutorial/backup-and-restore-tools/#point-in-time-operation-using-oplogs)
