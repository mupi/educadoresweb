(function(angular){
    'use strict';

    var app = angular.module('lesson.controllers', ['ngSanitize']);

    // configure existing services inside initialization blocks.
    app.config(['$locationProvider', function($locationProvider) {
      // Configure existing providers
      $locationProvider.hashPrefix('!');
    }]);

    app.controller('MainCtrl', ['$scope', '$sce', 'LessonData', 'Answer', 'Progress', '$location', 'youtubePlayerApi', 'resolveActivityTemplate',
        function ($scope, $sce, LessonData, Answer, Progress, $location, youtubePlayerApi, resolveActivityTemplate) {

            window.ga = window.ga || function(){};

            youtubePlayerApi.events.onStateChange = function(event){
                window.onPlayerStateChange.call($scope.currentUnit, event);
                if (event.data === YT.PlayerState.ENDED) {
                    if(angular.isArray($scope.currentUnit.activities) &&
                        $scope.currentUnit.activities.length > 0) {
                        $scope.section = 'activity';
                    } else {
                        progress = Progress.complete($scope.currentUnit.id);
                        $scope.currentUnit.progress = progress;
                        // $scope.nextUnit();
                    }
                    mixpanel.track("Watched whole video");
                    if(!$scope.$$phase) {
                        $scope.$apply();
                    }
                }
            };

            $scope.section = $scope.section || 'video';

            $scope.selectUnit = function(unit) {
                $scope.currentUnit = unit;

                if(unit.video) {
                    $scope.section = 'video';
                    $scope.play(unit.video.youtube_id);
                } else {
                    $scope.section = 'activity';
                }
                $scope.selectActivity(0);

                $scope.updatedisqusConfig($scope.currentUnit.id, $scope.currentUnit.title);
            };

            $scope.locationChange = function(unitIndex) {
              $location.path('/' + unitIndex);
            };

            $scope.nextUnit = function() {
                var index = $scope.lesson.units.indexOf($scope.currentUnit);
                index++;

                if(index < $scope.lesson.units.length) {
                    $location.path('/{0}'.format(index+1));
                } else {
                    // no next unit, so mark it as the end,
                    // and the template will show a next lesson
                    $scope.section = 'end';
                }
            };

            $scope.play = function() {
                if($scope.currentUnit.video){
                    var youtube_id = $scope.currentUnit.video.youtube_id;
                    $scope.section = 'video';

                    youtubePlayerApi.loadPlayer().then(function(player){
                            if(player.getVideoData && player.getVideoData() &&
                                player.getVideoData().video_id === youtube_id) return;
                            player.cueVideoById(youtube_id);
                    });
                } else {
                    $scope.section = 'activity';
                }
            };

            $scope.selectActivity = function(index) {

                if($scope.currentUnit.activities && $scope.currentUnit.activities.length) {
                    $scope.currentActivity = $scope.currentUnit.activities[index];
                    $scope.activityTemplateUrl = resolveActivityTemplate($scope.currentActivity.type);
                    ga("send", "event", "activity", "select", $scope.currentActivity.id);

                    $scope.answer = Answer.get({activityId: $scope.currentActivity.id}, function(answer) {
                        var exp = $scope.currentActivity.expected;
                        var giv = answer.given;

                        // Test if the answer type is array.
                        // See https://github.com/hacklabr/timtec/wiki/Atividades for details
                        if ($scope.currentActivity === 'relationship' ||
                            $scope.currentActivity === 'trueorfalse' ||
                            $scope.currentActivity === 'multiplechoice') {
                            // FIXME why this name?
                            // TODO test if professor changes the activity (create a new alternative, the user lost his answer?
                            var shouldUseLastAnswer = (exp !== null && exp !== undefined) &&
                                (angular.isArray(exp) && angular.isArray(giv) && giv.length === exp.length);

                            if (!shouldUseLastAnswer) {
                                // Initialize empty given answer
                                if(angular.isArray($scope.currentActivity.expected)) {
                                    answer.given = $scope.currentActivity.expected.map(function(){});
                                }
                                delete answer.correct;
                            }
                        }
                    },
                    function (error) {
                        console.log('answer does not exists or other errors');
                        var answer = {};
                        if(angular.isArray($scope.currentActivity.expected)) {
                            answer.given = $scope.currentActivity.expected.map(function(){});
                        }
                        $scope.answer = new Answer(answer);
                    });
                } else {
                    $scope.currentActivity = null;
                    $scope.activityTemplateUrl = null;
                };
                if ($scope.section == 'comment'){
                  $scope.section = 'activity';
                }
            };

            $scope.sendAnswer = function() {
		            mixpanel.track("Activity done");

                $scope.answer.activity = $scope.currentActivity.id;
                $scope.answer.$update({activityId: $scope.answer.activity}).then(function(answer){
                    console.log(answer, answer.correct);
                    ga('send', 'event', 'activity', 'result', '', answer.correct);
                    $scope.currentUnit.progress = Progress.get({unit: $scope.currentUnit.id});
                    answer.updated = true;
                    return answer;
                });
                ga('send', 'event', 'activity', 'submit');
            };

            $scope.sendAnswerText = function() {
                var progress;
                console.log('mandando resposta texto');
                progress = Progress.complete($scope.currentUnit.id);
                $scope.currentUnit.progress = progress;
                $scope.nextUnit();
            };

            $scope.nextStep = function(skipComment) {
                var progress;
                if($scope.section === 'video') {
                    if(angular.isArray($scope.currentUnit.activities) &&
                        $scope.currentUnit.activities.length > 0) {
                        $scope.section = 'activity';
                    } else {
                        progress = Progress.complete($scope.currentUnit.id);
                        $scope.currentUnit.progress = progress;
                        $scope.nextUnit();
                    }
                } else {
                    if($scope.section === 'activity' && !skipComment && $scope.currentActivity.comment) {
                        $scope.section = 'comment';
                    } else {
                        var index = $scope.currentUnit.activities.indexOf($scope.currentActivity);
                        if(index+1 === $scope.currentUnit.activities.length) {
                            $scope.currentUnit.progress = Progress.get({unit: $scope.currentUnit.id});
                            $scope.nextUnit();
                        } else {
                            $scope.selectActivity(index + 1);
                            $scope.section = 'activity';
                        }
                    }
                }
            };

            var start;
            $scope.$watch('currentUnit', function(currentUnit, lastUnit) {
                if(!$scope.lesson) return;
                // Changing Unit means unit starting
                if (start && lastUnit) {
                    var end = new Date().getTime();
                    ga('send', 'event', 'unit', 'time in unit',
                       $scope.lesson.course + ' - "' + $scope.lesson.name + '" - ' + lastUnit.id,
                       end - start);
                }
                ga('send', 'event', 'unit', 'start', $scope.lesson.course + ' - ' + $scope.lesson.name, $scope.currentUnit.id);
                start = new Date().getTime();
            });

            LessonData.then(function(lesson){
                $scope.lesson = lesson;

                var index = /\/(\d+)/.extract($location.path(), 1);
                index = parseInt(index, 10) - 1 || 0;
                $scope.selectUnit(lesson.units[index]);
                $scope.play();

                $scope.$on('$locationChangeSuccess', function (event, newLoc, oldLoc){

                   index = /#!\/(\d+)/.extract(document.location.hash, 1);
                   index = parseInt(index, 10) - 1 || 0;
                   $scope.selectUnit(lesson.units[index]);
                });
            });


            $scope.lesson_url = function(){
              $scope.c_unit = /#!\/(\d+)/.extract(document.location.hash, 1) + 1;
              if (!($scope.c_unit)){
                return window.location.href + '#!/1'
              } else {
                return window.location.href;
              }
            }

            $scope.lesson_url();
            $scope.disqusConfig = {
              disqus_shortname: 'tecsaladeaula',
              disqus_identifier: $scope.c_unit,
              disqus_url: $scope.lesson_url(),
              disqus_title: 'Mupi - Tecnologia para Sala de Aula'
            };

            $scope.updatedisqusConfig = function(unit, title) {
              $scope.disqusConfig = {
                disqus_shortname: 'tecsaladeaula',
                disqus_identifier: unit,
                disqus_url: $scope.lesson_url(),
                disqus_title: title
              };
            };

            $scope.get_as_safe_html = function(html_content) {
              return $sce.trustAsHtml(html_content);
            }
        }
    ]);

})(angular);


(function() {
    var _pauseFlag = false;
    var start, whole;

    var lastState = -1;

    function  onPlayerStateChange (event) {
        var video_id = event.target.getVideoData().video_id;

        if (event.data == YT.PlayerState.ENDED){
            if(! (lastState === YT.PlayerState.PAUSED ||   // workaround, YT in html5 mode will fire
                  lastState === YT.PlayerState.PLAYING)) { // event with ENDED state after cue video.
                event.data = lastState;
            } else {
                ga('send', 'event', 'videos', 'watch To end', video_id);
                if (whole === 'started') {
                    var stop = new Date().getTime();
                    var delta_s = (stop - start) / 1000;
                    ga('send', 'event', 'videos', 'time tO end', video_id, Math.round(delta_s));
                    whole = 'ended';
                }
            }
        }

        if (event.data == YT.PlayerState.PLAYING){
                ga('send', 'event', 'videos', 'play', video_id);
                _pauseFlag = false;
                if (whole !== 'ended' && whole !== 'started') {
                    start = new Date().getTime();
                    whole = 'started';
                }
        }

        if (event.data == YT.PlayerState.PAUSED && _pauseFlag === false){
            ga('send', 'event', 'videos', 'pause', video_id);
            _pauseFlag = true;
        }
        if (event.data == YT.PlayerState.BUFFERING){
            ga('send', 'event', 'videos', 'bufferIng', video_id);
        }
        if (event.data == YT.PlayerState.CUED){
            ga('send', 'event', 'videos', 'cueing', video_id);
        }

        lastState = event.data;
    }
    window.onPlayerStateChange = onPlayerStateChange;
})();
