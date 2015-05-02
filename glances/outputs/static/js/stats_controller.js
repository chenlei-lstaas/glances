glancesApp.controller('statsController', function($scope, $http, $interval, $q, $routeParams) {

    $scope.limitSuffix = ['critical', 'careful', 'warning'];
    $scope.refreshTime = 3;
    $scope.pluginLimits = [];
    $scope.sorter = {
        column: "cpu_percent",
        auto: true,
        isReverseColumn: function(column) {
            return !(column == 'username' || column == 'name');
        },
        getColumnLabel: function(column) {
            if (_.isEqual(column, ['io_read', 'io_write'])) {
                return 'io_counters';
            } else {
                return column;
            }
        }
    };
    $scope.help_screen = false;
    $scope.show = {
        'diskio' : true,
        'network' : true,
        'fs' : true,
        'sensors' : true,
        'sidebar' : true,
        'alert' : true,
        'short_process_name': true,
        'per_cpu': false,
        'warning_alerts':true,
        'warning_critical_alerts':true,
        'process_stats':true,
        'top_extended_stats':true,
        'docker_stats':true,
        'network_io_combination':false,
        'network_io_cumulative':false,
        'filesystem_freespace':false,
        'network_by_bytes':true
    };

    $scope.init_refresh_time = function() {
        if ($routeParams != undefined && $routeParams.refresh_time != undefined) {
            var new_refresh_time = parseInt($routeParams.refresh_time)
            if (new_refresh_time >= 1) {
                $scope.refreshTime = new_refresh_time
            }
        }
    }

    $scope.init_limits = function() {
        $scope.plugins_limits();
    }

    $scope.init_help = function() {
        $http.get('/api/2/help').success(function(response, status, headers, config) {
            $scope.help = response
        });
    }

    $scope.show_hide = function(bloc) {
        if(bloc == 'help') {
            $scope.help_screen = !$scope.help_screen
        } else {
            $scope.show[bloc] = !$scope.show[bloc]
        }
    }

    $scope.plugins_limits = function() {
        $http.get('/api/2/all/limits').success(function(response, status, headers, config) {
                $scope.limits = response
        }).error(function(response, status, headers, config) {
            console.log('error : ' + response+ status + headers + config);
        });
    }

    var canceler = undefined;

    /**
     * Refresh all the data of the view
     */
    $scope.refreshData = function() {
        canceler = $q.defer();
        $http.get('/api/2/all', {timeout: canceler.promise}).success(function(response, status, headers, config) {

            function timemillis(array) {
                var sum = 0.0
                for (var i = 0; i < array.length; i++) {
                    sum += array[i] * 1000.0;
                }
                return sum;
            }
            function leftpad(input) {
                if (input < 10) {
                    return "0" + input
                }
                return input
            }
            function timedelta(input) {
                var sum = timemillis(input);
                var d = new Date(sum);
                var hour = leftpad(d.getUTCHours()) // TODO : multiple days ( * (d.getDay() * 24)))
                var minutes = leftpad(d.getUTCMinutes())
                var seconds = leftpad(d.getUTCSeconds())
                var milliseconds = parseInt("" + d.getUTCMilliseconds() / 10)
                var millisecondsStr = leftpad(milliseconds)
                return hour +":" + minutes + ":" + seconds + "." + millisecondsStr
            };

            function dateformat(input) {
                var millis = input * 1000.0;
                var d = new Date(millis)
                var year = d.getFullYear()
                var month = leftpad(d.getMonth() + 1) // JANUARY = 0
                var day = leftpad(d.getDate())
                return year + "-" + month + "-" + day + " " + datetimeformat(input)

            }
            function datetimeformat(input) {
                var millis = input * 1000.0;
                var d = new Date(millis)
                var hour = leftpad(d.getUTCHours()) // TODO : multiple days ( * (d.getDay() * 24)))
                var minutes = leftpad(d.getUTCMinutes())
                var seconds = leftpad(d.getUTCSeconds())
                return hour + ":" + minutes + ":" + seconds
            }

            for (var i = 0; i < response['processlist'].length; i++) {
                var process = response['processlist'][i]
                process.memvirt = process.memory_info[1]
                process.memres  = process.memory_info[0]
                process.timeformatted = timedelta(process.cpu_times)
                process.timemillis = timemillis(process.cpu_times)
                process.io_read  = (process.io_counters[0] - process.io_counters[2]) / process.time_since_update
                process.io_write = (process.io_counters[1] - process.io_counters[3]) / process.time_since_update
            }
            for (var i = 0; i < response['alert'].length; i++) {
                var alert = response['alert'][i]
                alert.begin = dateformat(alert[0])
                alert.end = datetimeformat(alert[1] - alert[0])
            }
            $scope.result = response;
            canceler.resolve()
        }).error(function(d, status, headers, config) {
            console.log('error status:' + status + " - headers = " + headers);
            canceler.resolve()
        });
    }

    $scope.getClass = function(pluginName, limitNamePrefix, value, num) {
        if ($scope.pluginLimits != undefined && $scope.pluginLimits[pluginName] != undefined) {
            for (var i = 0; i < $scope.limitSuffix.length; i++) {
                var limitName = limitNamePrefix + $scope.limitSuffix[i]
                var limit = $scope.pluginLimits[pluginName][limitName]

                if (value >= limit) {
                    var pos = limitName.lastIndexOf("_")
                    var className = limitName.substring(pos + 1)
                    if (num == 1) {
                        return className + '_log'
                    }
                    return className
                }
            }
        }
        if (num == 1) {
            return "ok_log"
        }
        return "ok";
    }

    $scope.init_refresh_time();
    $scope.init_limits();
    $scope.init_help();

    var stop;
    $scope.configure_refresh = function () {
        if (!angular.isDefined(stop)) {
            //$scope.refreshData();
            stop = $interval(function() {
                $scope.refreshData();
            }, $scope.refreshTime * 1000); // in milliseconds
        }
    }

    $scope.$watch(
            function() { return $scope.refreshTime; },
            function(newValue, oldValue) {
                $scope.stop_refresh();
                $scope.configure_refresh();
            }
    );

    $scope.stop_refresh = function() {
        if (angular.isDefined(stop)) {
            $interval.cancel(stop);
            stop = undefined;
        }
    };

    $scope.$on('$destroy', function() {
        // Make sure that the interval is destroyed too
        $scope.stop_refresh();
    });

    $scope.onKeyDown = function($event) {
        if ($event.keyCode == keycodes.a) { // a  Sort processes automatically
            $scope.sorter.column = "cpu_percent";
            $scope.sorter.auto = true;
        } else if ($event.keyCode == keycodes.c) {//c  Sort processes by CPU%
            $scope.sorter.column =  "cpu_percent";
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.m) {//m  Sort processes by MEM%
            $scope.sorter.column = "memory_percent";
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.p) {//p  Sort processes by name
            $scope.sorter.column = "name";
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.i) {//i  Sort processes by I/O rate
            $scope.sorter.column = ['io_read', 'io_write'];
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.t) {//t  Sort processes by CPU times
            $scope.sorter.column = "timemillis";
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.u) {//t  Sort processes by user
            $scope.sorter.column = "username";
            $scope.sorter.auto = false;
        } else if ($event.keyCode == keycodes.d) {//d  Show/hide disk I/O stats
            $scope.show_hide('diskio')
        } else if ($event.keyCode == keycodes.f) {//f  Show/hide filesystem stats
            $scope.show_hide('fs')
        } else if ($event.keyCode == keycodes.n) {//n sort_by Show/hide network stats
            $scope.show_hide('network')
        } else if ($event.keyCode == keycodes.s) {//s  Show/hide sensors stats
            $scope.show_hide('sensors')
        } else if ($event.keyCode == keycodes.TWO && $event.shiftKey) {//2  Show/hide left sidebar
            $scope.show_hide('sidebar')
        } else if ($event.keyCode == keycodes.z) {//z  Enable/disable processes stats
            $scope.show_hide('process_stats')
        } else if ($event.keyCode == keycodes.e) {//e  Enable/disable top extended stats
            $scope.show_hide('top_extended_stats')
        } else if ($event.keyCode == keycodes.SLASH) {// SLASH  Enable/disable short processes name
            $scope.show_hide('short_process_name')
        } else if ($event.keyCode == keycodes.D && $event.shiftKey) {//D  Enable/disable Docker stats
            $scope.show_hide('docker_stats')
        } else if ($event.keyCode == keycodes.b) {//b  Bytes or bits for network I/O
            $scope.show_hide('network_by_bytes')
        } else if ($event.keyCode == keycodes.l) {//l  Show/hide alert logs
            $scope.show_hide('alert')
        } else if ($event.keyCode == keycodes.w) {//w  Delete warning alerts
            $scope.show_hide('warning_alerts')
        } else if ($event.keyCode == keycodes.x) {//x  Delete warning and critical alerts
            $scope.show_hide('warning_critical_alerts')
        } else if ($event.keyCode == keycodes.ONE && $event.shiftKey) {//1  Global CPU or per-CPU stats
            $scope.show_hide('per_cpu')
        } else if ($event.keyCode == keycodes.h) {//h  Show/hide this help screen
            $scope.show_hide('help')
        } else if ($event.keyCode == keycodes.T && $event.shiftKey) {//T  View network I/O as combination
            $scope.show_hide('network_io_combination')
        } else if ($event.keyCode == keycodes.u) {//u  View cumulative network I/O
            $scope.show_hide('network_io_cumulative')
        } else if ($event.keyCode == keycodes.F && $event.shiftKey) {//F  Show filesystem free space
            $scope.show_hide('filesystem_freespace')
        } else if ($event.keyCode == keycodes.g) {//g  Generate graphs for current history
            // not available
        } else if ($event.keyCode == keycodes.r) {//r  Reset history
            // not available
        } else if ($event.keyCode == keycodes.q) {//q  Quit (Esc and Ctrl-C also work)
            // not available
        }
    }
});
