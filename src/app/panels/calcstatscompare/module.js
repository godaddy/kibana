/*

  ## CalcStatsCompare Module

  ### Parameters
  * format :: The format of the value returned. (Default: number)
  * style :: The font size of the main number to be displayed.
  * mode :: The aggergate value to use for display
  * spyable ::  Dislay the 'eye' icon that show the last elasticsearch query

*/
define([
  'angular',
  'app',
  'lodash',
  'jquery',
  'kbn',
  'numeral'
], function (
  angular,
  app,
  _,
  $,
  kbn,
  numeral
) {

  'use strict';

  var module = angular.module('kibana.panels.calcstatscompare', []);
  app.useModule(module);

  module.controller('calcstatscompare', function ($scope, querySrv, dashboard, filterSrv) {

    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {title:'Queries', src:'app/partials/querySelect.html'}
      ],
      status: 'Beta',
      description: 'A statistical panel for displaying aggregations using the Elastic Search statistical facet query.'
    };

    $scope.modes = ['count','min','max','mean','total','variance','std_deviation','sum_of_squares'];

    var defaults = {
      queries     : {
        mode        : 'all',
        ids         : []
      },
      style   : { "font-size": '24pt'},
      format: 'number',
      mode: 'count',
      display_breakdown: 'yes',
      sort_field: '',
      sort_reverse: false,
      label_name: 'Query',
      value_name: 'Value',
      spyable     : true,
      show: {
        count: true,
        min: true,
        max: true,
        mean: true,
        std_deviation: true,
        sum_of_squares: true,
        total: true,
        variance: true
      }
    };

    _.defaults($scope.panel, defaults);

    $scope.init = function () {
      $scope.ready = false;
      $scope.$on('refresh', function () {
        $scope.get_data();
      });
      $scope.get_data();
    };

    $scope.set_sort = function(field) {
      console.log(field);
      if($scope.panel.sort_field === field && $scope.panel.sort_reverse === false) {
        $scope.panel.sort_reverse = true;
      } else if($scope.panel.sort_field === field && $scope.panel.sort_reverse === true) {
        $scope.panel.sort_field = '';
        $scope.panel.sort_reverse = false;
      } else {
        $scope.panel.sort_field = field;
        $scope.panel.sort_reverse = false;
      }
    };

    $scope.get_data = function () {
      if(dashboard.indices.length === 0) {
        return;
      }

      $scope.panelMeta.loading = true;

      var requestOrig,
        resultsOrig,
        boolQueryOrig,
        queriesOrig;

      requestOrig = $scope.ejs.Request().indices(dashboard.indices);

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
      queriesOrig = querySrv.getQueryObjs($scope.panel.queries.ids);


      // This could probably be changed to a BoolFilter
      boolQueryOrig = $scope.ejs.BoolQuery();
      _.each(queriesOrig,function(q) {
        boolQueryOrig = boolQueryOrig.should(querySrv.toEjsObj(q));
      });

      requestOrig = requestOrig
        .facet($scope.ejs.StatisticalFacet('calcstatscompare')
          .field($scope.panel.field)
          .facetFilter($scope.ejs.QueryFilter(
            $scope.ejs.FilteredQuery(
              boolQueryOrig,
              filterSrv.getBoolFilter(filterSrv.ids())
              )))).size(0);

      _.each(queriesOrig, function (q) {
        var alias = q.alias || q.query;
        var query = $scope.ejs.BoolQuery();
        query.should(querySrv.toEjsObj(q));
        requestOrig.facet($scope.ejs.StatisticalFacet('calcstatscompare_'+alias)
          .field($scope.panel.field)
          .facetFilter($scope.ejs.QueryFilter(
            $scope.ejs.FilteredQuery(
              query,
              filterSrv.getBoolFilter(filterSrv.ids())
            )
          ))
        );
      });

      // Populate the inspector panel
      $scope.inspector = angular.toJson(JSON.parse(requestOrig.toString()),true);

      resultsOrig = requestOrig.doSearch();

      resultsOrig.then(function(results) {
        $scope.panelMeta.loading = false;
        var value = results.facets.calcstatscompare[$scope.panel.mode];

        var rows = queriesOrig.map(function (q) {
          var alias = q.alias || q.query;
          var obj = _.clone(q);
          obj.label = alias;
          obj.Label = alias.toLowerCase(); //sort field
          obj.value = results.facets['calcstatscompare_'+alias];
          obj.Value = results.facets['calcstatscompare_'+alias]; //sort field
          return obj;
        });

        $scope.data = {
          value: value,
          rows: rows
        };


      });

      /*
        ultimate goal:
        input:
        "@(...) + @(...)"
        output:
        a number
        ->intermediary calculation: eval("3 + 4"), where ea. number corresponds to a mean/min/max/etc. of a @(...)
      */      

      var request,
        results,
        boolQuery,
        queries,
        tmp,
        nonUniqRequestList,
        requestList,
        dbItemOfInterestName,
        dbItemDict = {},
        numOfAjaxRespReceived = 0,
        rtnString = $scope.panel.fielddos
        ;

      request = $scope.ejs.Request().indices(dashboard.indices);

      $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
      queries = querySrv.getQueryObjs($scope.panel.queries.ids);


      // This could probably be changed to a BoolFilter
      boolQuery = $scope.ejs.BoolQuery();
      _.each(queries,function(q) {
        boolQuery = boolQuery.should(querySrv.toEjsObj(q));
      });

      // initially, need to scan the string and add ea. @(..) to a list
      nonUniqRequestList = $scope.panel.fielddos.match(/@content[\.\w]+/g);
      requestList = _.uniq(nonUniqRequestList); // each item in the array should be unique; list of strings

      requestList.forEach(function(dbItemOfInterestName, i, array) {
        request = request
          .facet($scope.ejs.StatisticalFacet('calcstatscompare')
            .field(dbItemOfInterestName)
            .facetFilter($scope.ejs.QueryFilter(
              $scope.ejs.FilteredQuery(
                boolQuery,
                filterSrv.getBoolFilter(filterSrv.ids())
                )))).size(0);

        _.each(queries, function (q) {
          var alias = q.alias || q.query;
          var query = $scope.ejs.BoolQuery();
          query.should(querySrv.toEjsObj(q));
          request.facet($scope.ejs.StatisticalFacet('calcstatscompare_'+alias)
            .field(dbItemOfInterestName)
            .facetFilter($scope.ejs.QueryFilter(
              $scope.ejs.FilteredQuery(
                query,
                filterSrv.getBoolFilter(filterSrv.ids())
              )
            ))
          );
        });

        // Populate the inspector panel
        $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);

        results = request.doSearch(); // returns a Promise object; sends the AJAX request

        results.then(function(results) {
          numOfAjaxRespReceived++;
          $scope.panelMeta.loading = false;
          var value = results.facets.calcstatscompare[$scope.panel.modedos];

          dbItemDict[dbItemOfInterestName] = value; // todo: maybe store an object instead of a number here for query support

          var rows = queries.map(function (q) {
            var alias = q.alias || q.query;
            var obj = _.clone(q);
            obj.label = alias;
            obj.Label = alias.toLowerCase(); //sort field
            obj.value = results.facets['calcstatscompare_'+alias];
            obj.Value = results.facets['calcstatscompare_'+alias]; //sort field
            return obj;
          });

          rtnString = rtnString.split(dbItemOfInterestName).join(dbItemDict[dbItemOfInterestName]);

          if (numOfAjaxRespReceived == array.length) { // at the last item in array
            // Process the array
            // go through the string

            value = eval(rtnString);

            $scope.datados = {
              value: value,
              rows: rows // rows currently only reflect queries of the last item retrieved from elasticsearch
            };

            $scope.$emit('render');
          }
        });
      });
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

  });

  module.filter('formatstats', function(){
    return function (value,format) {
      switch (format) {
      case 'money':
        value = numeral(value).format('$0,0.00');
        break;
      case 'bytes':
        value = numeral(value).format('0.00b');
        break;
      case 'float':
        value = numeral(value).format('0.000');
        break;
      default:
        value = numeral(value).format('0,0');
      }
      return value;
    };
  });

});
