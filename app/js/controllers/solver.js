"use strict";

angular.module('ffxivCraftOptWeb.controllers').controller('SolverController', function ($scope, $filter, $modal,
  $rootScope, $translate, _recipeLibrary, _simulator, _solver) {

  // Non-persistent page state
  $scope.simulatorTabs = {
    simulation: { active: true },
    solver: { actie: false }
  };

  //
  // RECIPE SEARCH
  //

  $scope.recipeSearch = {
    list: [],
    selected: 0,
    text: '',
    order: ['level','name']
  };

  $scope.$watch('recipeSearch.text', function () {
    $scope.updateRecipeSearchList();
  });

  $scope.$on('recipe.cls.changed', function () {
    $scope.recipeSearch.text = '';
    $scope.updateRecipeSearchList();
  });

  $scope.updateRecipeSearchList = function() {
    $scope.recipeSearch.loading = true;
    var p = _recipeLibrary.recipesForClass($translate.use(), $scope.recipe.cls);
    p.then(function (recipes) {
      $scope.recipeSearch.list = $filter('filter')(recipes, {name: $scope.recipeSearch.text});
      $scope.recipeSearch.selected = Math.min($scope.recipeSearch.selected, $scope.recipeSearch.list.length - 1);
      $scope.recipeSearch.loading = false;
    }, function (err) {
      console.error("Failed to retrieve recipes:", err);
      $scope.recipeSearch.list = [];
      $scope.recipeSearch.selected = -1;
      $scope.recipeSearch.loading = false;
    });
  };

  $rootScope.$on('$translateChangeSuccess', function () {
    $scope.updateRecipeSearchList();
  });

  $scope.recipeSelected = function (name) {
    // force menu to close and search field to lose focus
    // improves behaviour on touch devices
    document.getElementById('recipe-menu-root').closeMenu();
    document.getElementById('recipe-search-text').blur();

    var cls = $scope.recipe.cls;
    var p = angular.copy(_recipeLibrary.recipeForClassByName($translate.use(), cls, name));
    p.then(function (recipe) {
      recipe = angular.copy(recipe);
      recipe.cls = cls;
      recipe.startQuality = 0;
      $scope.$emit('recipe.selected', recipe);
    }, function (err) {
      console.error("Failed to load recipe:", err);
    });
  };

  $scope.deleteUserRecipe = function (name) {
    _recipeLibrary.deleteUserRecipe($scope.recipe.cls, name);
    $scope.updateRecipeSearchList();
  };

  $scope.onSearchKeyPress = function (event) {
    if (event.which == 13) {
      event.preventDefault();
      $scope.recipeSelected($scope.recipeSearch.list[$scope.recipeSearch.selected].name);
      event.target.parentNode.parentNode.closeMenu();
    }
  };

  $scope.onSearchKeyDown = function (event) {
    if (event.which === 40) {
      // down
      $scope.recipeSearch.selected = Math.min($scope.recipeSearch.selected + 1, $scope.recipeSearch.list.length - 1);
      document.getElementById('recipeSearchElement' + $scope.recipeSearch.selected).scrollIntoViewIfNeeded(false);
    }
    else if (event.which === 38) {
      // up
      $scope.recipeSearch.selected = Math.max($scope.recipeSearch.selected - 1, 0);
      document.getElementById('recipeSearchElement' + $scope.recipeSearch.selected).scrollIntoViewIfNeeded(false);
    }
  };

  $scope.showAddRecipeModal = function () {
    var modalInstance = $modal.open({
      templateUrl: 'modals/add-recipe.html',
      controller: 'AddRecipeController',
      windowClass: 'add-recipe-modal',
      resolve: {
        cls: function() { return $scope.recipe.cls; },
        level: function () { return $scope.crafter.stats[$scope.recipe.cls].level; }
      }
    });
    modalInstance.result.then(function (result) {
      _recipeLibrary.saveUserRecipe(result);
      $scope.updateRecipeSearchList();
    });
  };

  //
  // SIMULATION
  //

  $scope.simulatorStatus = {
    logText: '',
    running: false
  };

  $scope.$on('simulation.needs.update', function () {
    if ($scope.sequence.length > 0 && $scope.isValidSequence($scope.sequence, $scope.recipe.cls)) {
      $scope.runSimulation();
    }
    else {
      $scope.simulatorStatus.state = null;
      $scope.simulatorStatus.error = null;
    }
  });

  function simulationSuccess(data) {
    $scope.simulatorStatus.sequence = data.sequence;
    $scope.simulatorStatus.logText = data.log;
    $scope.simulatorStatus.state = data.state;
    $scope.simulatorStatus.error = undefined;
    $scope.simulatorTabs.simulation.active = true;
    $scope.simulatorStatus.running = false;
  }

  function simulationError(data) {
    $scope.simulatorStatus.sequence = data.sequence;
    $scope.simulatorStatus.logText = data.log;
    $scope.simulatorStatus.logText += '\n\nError: ' + data.error;
    $scope.simulatorStatus.state = undefined;
    $scope.simulatorStatus.error = data.error;
    $scope.simulatorTabs.simulation.active = true;
    $scope.simulatorStatus.running = false;
  }

  $scope.runSimulation = function () {
    if ($scope.simulatorStatus.running) {
      return;
    }

    var settings = {
      crafter: addBonusStats($scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats),
      recipe: $scope.recipe,
      sequence: $scope.sequence,
      maxTricksUses: $scope.sequenceSettings.maxTricksUses,
      maxMontecarloRuns: $scope.sequenceSettings.maxMontecarloRuns,
      reliabilityPercent: $scope.sequenceSettings.reliabilityPercent,
      useConditions: $scope.sequenceSettings.useConditions,
      debug: $scope.sequenceSettings.debug
    };

    if ($scope.sequenceSettings.specifySeed) {
      settings.seed = $scope.sequenceSettings.seed;
    }

    $scope.simulatorStatus.running = true;
    _simulator.start(settings, simulationSuccess, simulationError);
  };

  //
  // SEQUENCE EDITOR
  //

  $scope.editingSequence = false;

  $scope.$on('sequence.editor.save', function () {
    $scope.editingSequence = false;
  });

  $scope.$on('sequence.editor.cancel', function () {
    $scope.editingSequence = false;
  });

  $scope.$on('sequence.editor.simulation.start', function (event) {
    $scope.simulatorStatus.running = true;
  });

  $scope.$on('sequence.editor.simulation.success', function (event, data) {
    simulationSuccess(data);
  });

  $scope.$on('sequence.editor.simulation.error', function (event, data) {
    simulationError(data);
  });

  $scope.editSequenceInline = function () {
    $scope.editingSequence = true;
    $scope.$broadcast('sequence.editor.init', $scope.sequence,  $scope.recipe, $scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats, $scope.sequenceSettings)
  };

  $scope.useSolverResult = function () {
    var newSeq = $scope.solverResult.sequence;
    if (newSeq instanceof Array && newSeq.length > 0) {
      Array.prototype.splice.apply($scope.sequence, [0, newSeq.length].concat(newSeq));
    }
  };

  //
  // SOLVER
  //

  $scope.solverStatus = {
    running: false,
    generationsCompleted: 0,
    maxGenerations: 0,
    state: null,
    logText: '',
    sequence: [],
    error: null
  };

  $scope.solverResult = {
    logText: '',
    sequence: [],
    state: null
  };

  $scope.$on('synth.changed', function () {
    $scope.resetSolver();
  });

  function solverProgress(data) {
    $scope.solverStatus.generationsCompleted = data.generationsCompleted;
    $scope.solverStatus.maxGenerations = data.maxGenerations;
    $scope.solverStatus.state = data.state;
    $scope.solverStatus.bestSequence = data.bestSequence;
  }

  function solverSuccess(data) {
    $scope.solverResult.logText = data.log;
    $scope.solverResult.sequence = data.bestSequence;
    $scope.simulatorTabs.solver.active = true;
    $scope.solverStatus.state = data.state;
    $scope.solverStatus.running = false;
  }

  function solverError(data) {
    $scope.solverStatus.error = data.error;
    $scope.solverResult.logText = data.log;
    $scope.solverResult.logText += '\n\nError: ' + data.error;
    $scope.solverResult.sequence = [];
    $scope.simulatorTabs.solver.active = true;
    $scope.solverStatus.running = false;
    $scope.solverStatus.generationsCompleted = 0;
  }

  $scope.startSolver = function () {
    var settings = {
      crafter: addBonusStats($scope.crafter.stats[$scope.recipe.cls], $scope.bonusStats),
      recipe: $scope.recipe,
      sequence: $scope.sequence,
      algorithm: $scope.solver.algorithm,
      maxTricksUses: $scope.sequenceSettings.maxTricksUses,
      maxMontecarloRuns: $scope.sequenceSettings.maxMontecarloRuns,
      reliabilityPercent: $scope.sequenceSettings.reliabilityPercent,
      useConditions: $scope.sequenceSettings.useConditions,
      solver: $scope.solver,
      debug: $scope.sequenceSettings.debug
    };
    if ($scope.sequenceSettings.specifySeed) {
      settings.seed = $scope.sequenceSettings.seed;
    }
    $scope.solverStatus.running = true;
    _solver.start(settings, solverProgress, solverSuccess, solverError);
  };

  $scope.resetSolver = function() {
    $scope.solverStatus.error = null;
    $scope.solverStatus.generationsCompleted = 0;
    $scope.solverStatus.maxGenerations = $scope.solver.generations;
    $scope.solverStatus.state = null;
    $scope.solverResult.logText = "";
    $scope.solverResult.sequence = [];
  };

  $scope.resumeSolver = function() {
    $scope.solverStatus.running = true;
    _solver.resume();
  };

  $scope.stopSolver = function () {
    _solver.stop();
  };

  // Trigger simulation update
  $scope.$broadcast('simulation.needs.update');

});
