'use strict';

const BbPromise = require('bluebird');
const AWS = require('aws-sdk');

class ConfigureKdaPlugin {
    
    constructor(serverless, options) {
        this.serverless = serverless;
        this.options = options;
        this.provider = this.serverless.getProvider('aws');
        this.assetSet = this.serverless.service.custom.assets.targets[0];
        AWS.config.update({
            region: serverless.service.provider.region
        });

        this.kinesisanalyticsv2 = new AWS.KinesisAnalyticsV2();
        

        this.commands = {
            myplugin: {
                commands: {
                    kda: {
                        usage: 'Helps you start your first Serverless plugin',
                        lifecycleEvents: ['cfg'],
                    },
                }
            }
        };

        this.hooks = {
            'after:deploy:finalize': () => this.serverless.pluginManager.run(['myplugin', 'kda']),
            'myplugin:kda:cfg': this.configureKda.bind(this),
        };
    }

    configureKda() {
        this.log('Configuring kda');
        this.log('Resolving app bucket');
        this.listStackResources().then(resources => {
            this.resolveBucket(resources, this.assetSet.bucket)
                .then(bucket => {
                    this.log(`Resolved app bucket to ${bucket}`);

                    // TODO get the app name from CF
                    var reqParams = {"ApplicationName": "tdax-flink-svc-dev4227s-us-east-1-tdax-flink-svc"};
                    var that = this;
                    this.kinesisanalyticsv2.describeApplication(reqParams, function(err, resp) {
                        if (err) {
                            return BbPromise.reject(err);
                        }
                        var str = JSON.stringify(resp, null, 2);
                        that.log(str);

                        that.log("updating app");
                        var updateReqParams = {
                            ApplicationName: resp.ApplicationDetail.ApplicationName,
                            ApplicationConfigurationUpdate: {
                                ApplicationCodeConfigurationUpdate: {
                                    CodeContentTypeUpdate: "ZIPFILE",
                                    CodeContentUpdate: {
                                        S3ContentLocationUpdate: {
                                            // TODO set the bucket arn
                                            BucketARNUpdate: resp.ApplicationDetail.ApplicationConfigurationDescription.ApplicationCodeConfigurationDescription.CodeContentDescription.S3ApplicationCodeLocationDescription.BucketARN,
                                            FileKeyUpdate: "c1ws-tdax-flink-svc-0.0.1-all.jar"
                                        }
                                    }
                                }
                            },
                            CurrentApplicationVersionId: resp.ApplicationDetail.ApplicationVersionId
                        };

                        that.kinesisanalyticsv2.updateApplication(updateReqParams, function(err, data) {
                            if (err) {
                                return BbPromise.reject(err);
                            }
                            that.log("post update app");
                            var str = JSON.stringify(data, null, 2);
                            that.log(data);                            
                            
                        });
                        
                        
                    });

                    
                    
                });
        });
    }

    log(message) {
        this.serverless.cli.log(message);
    }
    
    listStackResources(resources, nextToken) {
        resources = resources || [];
        return this.provider.request('CloudFormation', 'listStackResources', { StackName: this.provider.naming.getStackName(), NextToken: nextToken })
            .then(response => {
                resources.push.apply(resources, response.StackResourceSummaries);
                if (response.NextToken) {
                    // Query next page
                    return this.listStackResources(resources, response.NextToken);
                }
            })
            .then(() => {
                var str = JSON.stringify(resources, null, 2); 
                this.log(`Listed stack resources: `);
                this.log(str);
                return resources;
            });
    }

    resolveBucket(resources, value) {
        this.log(`Resolving bucket: ${value}`);
        var str = JSON.stringify(value, null, 2); 
        this.log(str);
        
        if (typeof value === 'string') {
            return BbPromise.resolve(value);
        }
        else if (value && value.Ref) {
            let resolved;
            resources.forEach(resource => {
                if (resource && resource.LogicalResourceId === value.Ref) {
                    resolved = resource.PhysicalResourceId;
                }
            });

            if (!resolved) {
                this.log(`WARNING: Failed to resolve reference ${value.Ref}`);
            }
            return BbPromise.resolve(resolved);
        }
        else {
            return BbPromise.reject(new Error(`Invalid bucket name ${value}`));
        }
    }
}

module.exports = ConfigureKdaPlugin;
