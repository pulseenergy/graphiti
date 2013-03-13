var app = Sammy('body', function() {
  this.use('Session');
  this.use('NestedParams');

  var canon = require("pilot/canon");

  this.registerShortcut = function(name, keys, callback) {
    var app = this;
    app.bind(name, callback);
    canon.addCommand({
       name: name,
       bindKey: {
         win: "Ctrl-" + keys,
         mac: "Command-" + keys,
         sender: 'editor'
       },
       exec: function() {
         app.trigger(name);
       }
    });

    key('command+' + keys, function() {
      app.trigger(name);
      return false;
    });
  };

  this.helpers({
    showPane: function(pane, content) {
      var selector = '#' + pane + '-pane';
      $('.pane:not(' + selector + ')').hide();
      var $pane = $(selector);
      if (content) { $pane.html(content); }
      return $pane.show();
    },
    setupEditor: function() {
      if (this.app.editor) return;

      var ctx = this;
      var editor = this.app.editor = ace.edit("editor");
      editor.setTheme("ace/theme/textmate");
      var JSONMode = require("ace/mode/json").Mode;
      var session = editor.getSession();
      session.setMode(new JSONMode());
      session.setUseSoftTabs(true);
      session.setTabSize(2);
    },
    redrawPreview: function() {
      try {
        this.log('redraw');
        this.graphPreview(this.getEditorJSON());
      } catch(e) {
        alert(e);
      }
      return false;
    },
    showEditor: function(text, uuid) {
      this.showPane('editor');
      if (!text) {
        text = defaultGraph;
      }
      this.setupEditor();
      var text = this.setEditorJSON(text);
      $('#editor').show();
      this.graphPreview(JSON.parse(text));
      this.buildDashboardsDropdown(uuid);
      if (uuid) { // this is an already saved graph
        $('#graph-actions form').attr('data-action', function(i, action) {
          if (action) {
            $(this).attr('action', action.replace(/:uuid/, uuid));
          }
        }).show();
        $('[name=uuid]').val(uuid);
        $('#graph-actions').find('.update, .dashboard, .snapshots').show();
      } else {
        $('#graph-actions').find('.update, .dashboard, .snapshots').hide();
      }
      this.toggleEditorPanesByPreference();
    },
    getEditorJSON: function() {
      return JSON.parse(this.app.editor.getSession().getValue());
    },
    setEditorJSON: function(text) {
      if (typeof text != 'string') {
        text = JSON.stringify(text, null, 2);
      }
      this.app.editor.getSession().setValue(text);
      return text;
    },
    graphPreview: function(options) {
      // get width/height from img
      this.session('lastPreview', options, function() {
        var $img = $("#graph-preview img"), $url = $('#graph-url input');
        var graph = new Graphiti.Graph(options);
        graph.image($img);
        $url.val(graph.buildURL());
      });
      this.updateOptionsForm(options);
    },
    updateOptionsForm: function(options) {
      var opts = options.options ? options.options : options,
          key, $form = $('#graph-options form');
      for (key in opts) {
        if (opts[key] != '') {
          var formInput = $form.find('[name="options[' + key + ']"]');
          if (formInput.is(':checkbox')) {
            formInput.prop('checked', opts[key]);
          } else {
            formInput.val(opts[key]);
          }
        }
      }
    },
    saveOptions: function(params) {
      var json = this.getEditorJSON();
      json.options = params;
      this.graphPreview(json);
      this.setEditorJSON(json);
    },
    buildMetricsList: function($list, metrics) {
      var $li = $list.find('li:first').clone();
      $list.html('');
      var i = 0, l = metrics.length;
      for (; i < l; i++) {
        Sammy.log(metrics[i]);
        $li.clone()
        .attr('id', "metric_list_metric_" + i)
        .find('strong').text(metrics[i])
        .end()
        .appendTo($list).show();
      }
    },
    buildSuggestionsList: function($list, prefix, keywords) {
      var $li = $list.find('li:first').clone();
      $list.html('');
      var i = 0, l = keywords.length;
      for (; i < l; i++) {
        var full_search = (prefix.length > 0) ? prefix + "." + keywords[i] : keywords[i];
        $li.clone()
        .attr('id', "suggestion_" + i)
        .find('span.search').text(full_search).end()
        .find('strong.keyword').text(keywords[i]).end()
        .appendTo($list).show();
      }
    },
    bindMetricsList: function() {
      var ctx = this;
      var $results_list = $('#metrics-list ul.results');
      var $suggestions_list = $('#metrics-list ul.suggestions');
      var throttle;
      var metricsMenu = $('#metrics-menu').find('input[type="search"]');
      metricsMenu.live('keyup', function() {
        var val = $(this).val();
        if (throttle) {
          clearTimeout(throttle);
        }
        throttle = setTimeout(function() {
          ctx.searchMetricsList(val);
        }, 200);
      }).live('keypress', function(event) {
        var keyCode = event.keyCode;
        if (keyCode == 9) { //TAB pressed
          event.preventDefault();
          if ($suggestions_list.is(":visible")) {
            $suggestions_list.find("li:first a").click();
          }
        }
      });
      $results_list.delegate('li a', 'click', function(e) {
        e.preventDefault();
        var action = $(this).attr('rel'),
            metric = $(this).siblings('strong').text();
        Sammy.log('clicked', action, metric);
        ctx[action + "GraphMetric"](metric);
      }).addClass('.bound');
      
      $suggestions_list.delegate('li a', 'click', function(e) {
        e.preventDefault();
        var suggestion = $(this).find('span.search').text();
        Sammy.log('search suggestion clicked', suggestion);
        ctx.setSearch(suggestion + '.');
      }).addClass('.bound');
    },
    metricRequestPending: 0,
    keywordRequestPending: 0,
    searchMetricsList: function(search) {
      var ctx = this;
      var $results_list = $('#metrics-list ul.results')
      var $suggestions_list = $('#metrics-list ul.suggestions')
      var $loading = $('#metrics-list .loading');
      var $empty = $('#metrics-list .empty');

      if (search.length >= 4) {
        var url = '/metrics.js';
        url += '?q=' + search;
        $empty.hide();
        $loading.show();
        var localMetricRequestPending = ++ctx.metricRequestPending;
        this.load(url).then(function(metrics) {
          if (localMetricRequestPending == ctx.metricRequestPending) {
            var metrics = metrics.metrics;
            $loading.hide();
            if (metrics.length > 0) {
              $results_list.show();
              ctx.buildMetricsList($results_list, metrics);
            } else {
              $results_list.hide();
              $empty.show();
            }
          }
        });
      }
            
      if (search.length >= 2) {
        var keywords=search.split(/[\. ]/);
        var prefix=""
        if (keywords.length > 1) {
          prefix = keywords.splice(0,keywords.length-1).join(".")
        }
        var last_keyword = keywords[keywords.length-1]
        if (last_keyword.length >= 2) {
          var url = '/keywords.js';
          url += '?q=' + last_keyword + '&max=5';
          var localKeywordRequestPending = ++ctx.keywordRequestPending;
          this.load(url).then(function(results) {
            if (localKeywordRequestPending == ctx.keywordRequestPending) {
              var keywords = results.keywords;
              if (keywords.length > 0) {
                $suggestions_list.show();
                ctx.buildSuggestionsList($suggestions_list, prefix, keywords);
              } else {
                $suggestions_list.hide();
              }
            }
          });
        } else {
          $suggestions_list.hide();
        }
      } else {
        $empty.show();
        $results_list.hide();
        $suggestions_list.hide();
      }
    },
    addGraphMetric: function(metric) {
      var json = this.getEditorJSON();
      json.targets.push([metric, {}]);
      this.graphPreview(json);
      this.setEditorJSON(json);
    },
    replaceGraphMetric: function(metric) {
      var json = this.getEditorJSON();
      json.targets = [[metric, {}]];
      this.graphPreview(json);
      this.setEditorJSON(json);
    },
    setSearch: function(searchString) {
      var $metricsMenu = $('#metrics-menu').find('input[type="search"]');
      $metricsMenu.val(searchString);
      this.searchMetricsList(searchString);
      $metricsMenu.focus();
    },
    timestamp: function(time) {
      if (typeof time == 'string') {
        time = parseInt(time, 10);
      }
      return new Date(time * 1000).toString();
    },
    buildDashboardsDropdown: function(uuid) {
      this.load('/dashboards.js', {cache: false, data: {uuid: uuid}})
          .then(function(data) {
            var $select = $('select[name="dashboard"]');
            $select.html('');
            var dashboards = data.dashboards,
                i = 0,
                l = dashboards.length,
                dashboard;
            for (; i < l; i++) {
              dashboard = dashboards[i];
              $('<option />', {
                value: dashboard.slug,
                text: dashboard.title
              }).appendTo($select);
            }
          });
    },
    buildSnapshotsDropdown: function(urls, clear) {
      var $select = $('select[name="snapshot"]');
      if (clear) { $select.html(''); }
      var i = 0,
          l = urls.length, url, date;
      for (; i < l; i++) {
        url = urls[i];
        date = this.snapshotURLToDate(url);
        $('<option />', {
          value: url,
          text: date
        }).prependTo($select).attr('selected', 'selected');
      }
    },
    loadAndRenderGraphs: function(url) {
      var ctx = this;
      var $graphs = this.showPane('graphs', ' ');
      this.load(url, {cache: false})
          .then(function(data) {
            var title = 'All Graphs', all_graphs;
            if (data.title) {
              all_graphs = false;
              title = data.title;
            } else {
              all_graphs = true;
            }
            $graphs.append('<h2>' + title + '</h2>');
            var graphs = data.graphs,
                i = 0,
                l = graphs.length,
                $graph = $('#templates .graph').clone(),
                graph;
            if (data.graphs.length == 0) {
              $graphs.append($('#graphs-empty'));
              return true;
            }
            for (; i < l; i++) {
              graph = graphs[i];

              $graph
              .clone()
              .find('.title').text(graph.title || 'Untitled').end()
              .find('a.edit').attr('href', '/graphs/' + graph.uuid).end()
              .show()
              .data("graph", graph.json)
              .appendTo($graphs).each(function() {
                ctx.drawGraph(graph.json, $(this).find('img'));
                // add a last class alternatingly to fix the display grid
                if ((i+1)%2 == 0) {
                  $(this).addClass('last');
                }
                // if its all graphs, delete operates on everything
                if (all_graphs) {
                  $(this)
                  .find('.delete')
                  .attr('action', '/graphs/' + graph.uuid);
                // otherwise it just removes the graphs
                } else {
                  $(this)
                  .find('.delete')
                  .attr('action', '/graphs/dashboards')
                  .find('[name=dashboard]').val(data.slug).end()
                  .find('[name=uuid]').val(graph.uuid).end()
                  .find('[type=submit]').val('Remove');
                }
              });
            }
          });
    },
    drawGraph: function(graph_json, $img_location) {
      var graph_data = JSON.parse(graph_json);
      $.extend(true, graph_data, this.getOptionOverrides());
      graph_obj = new Graphiti.Graph(graph_data);
      // actually replace the graph image
      graph_obj.image($img_location);
    },
    redrawGraphs: function() {
      var ctx = this;
      var $graphs =  $('#graphs-pane');
      if (!$graphs.is(":visible")) {
        return;
      }
      var graph_obj, graph_data;
      $graphs.find(".graph").each(function() {
        ctx.drawGraph($(this).data("graph"), $(this).find('img'));
      });
    },
    loadAndRenderDashboards: function() {
      var $dashboards = this.showPane('dashboards', '<h2>Dashboards</h2>');
      var ctx = this;

      this.load('/dashboards.js', {cache: false})
          .then(function(data) {
            var dashboards = data.dashboards,
            i = 0, l = dashboards.length, dashboard, alt,
            $dashboard = $('#templates .dashboard').clone();

            if (dashboards.length == 0) {
              $dashboards.append($('#dashboards-empty'));
            } else {
              for (; i < l;i++) {
                dashboard = dashboards[i];
                alt = ((i+1)%2 == 0) ? 'alt' : '';
                $dashboard.clone()
                  .find('a.view').attr('href', '/dashboards/' + dashboard.slug).end()
                  .find('.title').text(dashboard.title).end()
                  .find('.graphs-count').text(dashboard.graphs.length).end()
                  .find('.updated-at').text(ctx.timestamp(dashboard.updated_at)).end()
                  .find('form.delete').attr('action','/dashboards/'+dashboard.slug).end()
                  .addClass(alt)
                  .show()
                  .appendTo($dashboards);
              }
            }

          });
    },

    loadAndRenderSnapshots: function() {
      var ctx = this;
      this.load('/graphs/' + this.params.uuid + '.js', {cache: false})
          .then(function(graph_data) {
            var $snapshots = ctx.showPane('snapshots', '<h2>' + graph_data.title + ' - Snapshots</h2>');
            var snapshots = graph_data.snapshots,
            i = 0, l = snapshots.length, snapshot,
            $snapshot = $('#templates .snapshot').clone();
            for (; i < l; i++) {
              snapshot = snapshots[i];
              $snapshot.clone()
              .find('a.view').attr('href', snapshot).end()
              .find('img').attr('src', snapshot).end()
              .find('h3.title').text(ctx.snapshotURLToDate(snapshot)).end()
              .show()
              .appendTo($snapshots);
            }
          });
    },

    snapshotURLToDate: function(url) {
      var date;
      try {
        date = new Date(parseInt(url.match(/\/(\d+)\.png/)[1], 10)).toString();
      } catch (e) { }
      return date;
    },

    bindEditorPanes: function() {
      var ctx = this;
      $('#editor-pane')
      .delegate('.edit-group .edit-head', 'click', function(e) {
        e.preventDefault();
        var $group = $(this).add($(this).siblings('.edit-body'))
        var group_name = $group.parents('.edit-group').attr('data-group');
        if ($group.is('.closed')) {
          $group.removeClass('closed').addClass('open');
          ctx.session('groups:' + group_name, true);
        } else {
          $group.addClass('closed').removeClass('open');
          ctx.session('groups:' + group_name, false);
        }
      });
    },

    toggleEditorPanesByPreference: function() {
      var ctx = this;
      $('#editor-pane .edit-group').each(function() {
        var $group = $(this), group_name = $group.attr('data-group'),
            $parts = $group.find('.edit-head, .edit-body');
        ctx.session('groups:' + group_name, function(open) {
          if (open) {
            $parts.removeClass('closed').addClass('open');
          } else {
            $parts.removeClass('open').addClass('closed');
          }
        });
      });
    },

    confirmDelete: function(type) {
      var warning = "Are you sure you want to delete this " + type + "? There is no undo. You may regret this later.";
      return confirm(warning);
    },

    showSaving: function(title) {
      this.$button = $(this.target).find('input');
      this.original_button_val = this.$button.val();
      this.$button.val('Saving').attr('disabled', 'disabled');
    },

    hideSaving: function() {
      this.$button.val(this.original_button_val).removeAttr('disabled');
    },
    
    bindTimeSelector: function() {
      var ctx = this;
      $('#time-selector')
      .delegate('button', 'click', function(e) {
        var $button = $(this);
        var value = $button.val();
        $button.siblings("button").removeClass("selected");
        $button.addClass("selected");
        ctx.redrawGraphs();
      });
    },
    
    getOptionOverrides: function() {
      var fromTime = $('#time-selector button.selected').val();
      if (fromTime) {
        return {"options": {"from": fromTime, "until": ""}};
      }
      return {};
    }
  });

  this.before({only: {verb: 'get'}}, function() {
    this.showPane('loading');
  });

  this.get('/graphs/new', function(ctx) {
    this.session('lastPreview', Graphiti.defaultGraph, function() {
      ctx.redirect('/graphs/workspace');
    });
  });

  this.get('/graphs/workspace', function(ctx) {
    this.session('lastPreview', function(lastPreview) {
      ctx.showEditor(lastPreview);
    });
  });

  this.get('/graphs/:uuid', function(ctx) {
    this.load('/graphs/' + this.params.uuid + '.js', {cache: false})
        .then(function(graph_data) {
          ctx.buildSnapshotsDropdown(graph_data.snapshots, true);
          ctx.showEditor(graph_data.json, ctx.params.uuid);
        });
  });

  this.get('/graphs/:uuid/snapshots', function(ctx) {
    if (this.params.snapshot) {
      window.open(this.params.snapshot, this.snapshotURLToDate(this.params.snapshot));
      this.redirect('/graphs', this.params.uuid);
    } else {
      this.loadAndRenderSnapshots();
    }
  });

  this.get('/graphs', function(ctx) {
    this.loadAndRenderGraphs('/graphs.js');
  });

  this.get('/dashboards/:slug', function(ctx) {
    this.loadAndRenderGraphs('/dashboards/' + this.params.slug + '.js');
  });

  this.get('/dashboards', function(ctx) {
    this.loadAndRenderDashboards();
  });

  this.del('/dashboards/:slug', function(ctx){
    var slug = this.params.slug;
    if (this.confirmDelete('dashboard')) {
      $.ajax({
        type: 'post',
        data: '_method=DELETE',
        url: '/dashboards/'+slug,
        complete: function(resp){
          ctx.loadAndRenderDashboards();
        }
      });
    }
  });

  this.del('/graphs/dashboards', function(ctx){
    if (this.confirmDelete('graph')) {
      $.ajax({
        type: 'post',
        data: $(ctx.target).serialize() + '&_method=DELETE',
        url: '/graphs/dashboards',
        success: function(resp){
          ctx.app.refresh();
        }
      });
    }
  });

  this.del('/graphs/:uuid', function(ctx){
    if (this.confirmDelete('graph')) {
      $.ajax({
        type: 'post',
        data: '_method=DELETE',
        url: '/graphs/'+ this.params.uuid,
        success: function(resp){
          ctx.app.refresh();
        }
      });
    }
  });

  this.get('', function(ctx) {
    this.loadAndRenderDashboards();
  });

  this.post('/graphs', function(ctx) {
    ctx.showSaving();
    var graph = new Graphiti.Graph(this.getEditorJSON());
    graph.save(function(resp) {
      ctx.hideSaving();
      Sammy.log('created', resp);
      if (resp.uuid) {
        ctx.redirect('/graphs/' + resp.uuid);
      }
    });
  });

  this.put('/graphs/options', function(ctx) {
    this.saveOptions(this.params.options);
  });

  this.post('/graphs/:uuid/snapshots', function(ctx) {
    ctx.showSaving();
    var graph = new Graphiti.Graph(this.getEditorJSON());
    graph.snapshot(this.params.uuid, function(url) {
      ctx.hideSaving();
      Sammy.log('snapshotted', url);
      if (url) {
        ctx.buildSnapshotsDropdown([url]);
      }
    });
  });

  this.put('/graphs/:uuid', function(ctx) {
    ctx.showSaving();
    var graph = new Graphiti.Graph(this.getEditorJSON());
    graph.save(this.params.uuid, function(response) {
      Sammy.log('updated', response);
      ctx.hideSaving();
      ctx.redrawPreview();
    });
  });

  this.post('/graphs/dashboards', function(ctx) {
    var $target = $(this.target);
    $.post('/graphs/dashboards', $target.serialize(), function(resp) {
      ctx.buildDashboardsDropdown(resp.uuid);
    });
  });

  this.post('/dashboards', function(ctx) {
    var $target = $(this.target);
    $.post('/dashboards', $target.serialize(), function(resp) {
      $target.find('input[type=text]').val('');
      ctx.buildDashboardsDropdown();
      ctx.trigger('toggle-dashboard-creation', {target: $target.parents('.dashboard')});
    });
  });

  this.bind('toggle-dashboard-creation', function(e, data) {
    var $parent = $(data.target);
    var $new = $parent.find('.new-dashboard');
    var $add = $parent.find('.add-to-dashboard');
    if ($new.is(':visible')) {
      $new.hide(); $add.show();
    } else {
      $new.show(); $add.hide();
    }
  });

  this.registerShortcut('redraw-preview', 'g', function() {
    this.redrawPreview();
  });

  this.bind('run', function() {
    var ctx = this;

    this.bindEditorPanes();
    this.bindMetricsList();
    this.bindTimeSelector();

    var disableSave = function() {
      if ($(this).val().toString() == '') {
        $(this).siblings('.save').attr('disabled', 'disabled');
      } else {
        $(this).siblings('.save').removeAttr('disabled');
      }
    };
    $('select[name="dashboard"]')
      .live('click', disableSave)
      .live('focus', disableSave)
      .live('blur', disableSave);
    $('.dashboard button[rel=create], .dashboard a[rel="cancel"]').live('click', function(e) {
      e.preventDefault();
      ctx.trigger('toggle-dashboard-creation', {target: $(this).parents('.dashboard')});
    });

    $('#graph-actions').delegate('.redraw', 'click', function(e) {
      e.preventDefault();
      ctx.redrawPreview();
    });
  });

});

$(function() {
  app.run();
});
