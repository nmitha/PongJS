/* Author:Nadeem Mitha
Date: April 2012
*/

// TODO: Use JSLint
(function( pong, undefined ) {

    "use strict";

    // Basic "class" definitions
    function Position(x, y) {
        this.x = x;
        this.y = y;
    }

    function Dimensions(width, height) {
        this.width = width;
        this.height = height;
    }

    function Velocity(xvel, yvel) {
        this.xvel = xvel; // in pixels/frame
        this.yvel = yvel;
    }

    function Entity() {
        this.visible = true;
        this.position = new Position(0, 0);
        this.velocity = new Velocity(0, 0);
    }
    Entity.prototype.constructor = Entity;
    Entity.prototype.draw = function () { }; // needs to be overridden
    Entity.prototype.move = function () {
        this.position.x += this.velocity.xvel;
        this.position.y += this.velocity.yvel;
    };

    function RectangularEntity() {
        Entity.call(this); // inherits Entity
    }
    RectangularEntity.prototype = new Entity(); // inheritance
    RectangularEntity.prototype.constructor = RectangularEntity;
    RectangularEntity.prototype.dimensions = new Dimensions(16, 90);
    RectangularEntity.prototype.color = "#000000";
    RectangularEntity.prototype.draw = function (canvasCtx) {
        if (this.visible == false) { return; }

        canvasCtx.fillStyle = this.color;
        canvasCtx.fillRect(this.position.x, this.position.y, this.dimensions.width, this.dimensions.height);
    };
    RectangularEntity.prototype.overlapsWith = function (otherEntity) {
        var isOverlap = false;
        if (otherEntity.position.x >= this.position.x && otherEntity.position.x <= this.position.x + this.dimensions.width
                && otherEntity.position.y >= this.position.y && otherEntity.position.y <= this.position.y + this.dimensions.height) {
            isOverlap = true;
        }
        return isOverlap;
    };
    // -------------

    // "Class" definitions for the main game entities
    function Paddle() {
        RectangularEntity.call(this); // inherits RectangularEntity
    }
    Paddle.prototype = new RectangularEntity(); // inheritance
    Paddle.prototype.constructor = Paddle;
    //Paddle.prototype.score = 0;
    Paddle.prototype.moveStep = 16;
    Paddle.prototype.moveDown = function (canvasDimensions) {
        this.position.y += this.moveStep;
        this.position.y = Math.min(canvasDimensions.height - this.dimensions.height, this.position.y); // don't allow the paddle to move below the canvas
    };
    Paddle.prototype.moveUp = function (canvasDimensions) {
        this.position.y -= this.moveStep;
        this.position.y = Math.max(0, this.position.y); // don't allow negative (i.e. moving higher than the top of the screen)
    };

    function PlayerPaddle() {
        Paddle.call(this); // inherits Paddle
    }
    PlayerPaddle.prototype = new Paddle();
    PlayerPaddle.prototype.constructor = PlayerPaddle;

    /*
    //TODO: Implement ComputerPaddle with AI
    function ComputerPaddle() {
        Paddle.call(this);
    }
    ComputerPaddle.prototype = new Paddle;
    ComputerPaddle.prototype.constructor = ComputerPaddle;
    */

    function Ball() {
        RectangularEntity.call(this);

        this.dimensions = new Dimensions(12, 12);
        this.color = "#000000";
        var randomDirection = Math.pow(-1, Math.round(Math.random() * 10));
        this.velocity = new Velocity(4 * randomDirection, 4);
    }
    Ball.prototype = new RectangularEntity();
    Ball.prototype.constructor = Ball;
    // ------------------

    // Enums and constants
    var GameState = {
        NEW_GAME_STARTED: { name: "New Game", code: "NEW_GAME_STARTED" },
        GAME_IN_PROGRESS: { name: "Game in progress", code: "GAME_IN_PROGRESS" },
        POINT_SCORED: { name: "Point Scored", code: "POINT_SCORED" },
        PAUSED: { name: "Paused", code: "PAUSED" },
        GAME_OVER: { name: "Game Over", code: "GAME_OVER" }
        // TODO: Game Over, Menu, etc.
    };

    var GameMode = {
        ONE_PLAYER: { name: "One Player Time Trial", code: "ONE_PLAYER" },
        TWO_PLAYER: { name: "Two Players", code: "TWO_PLAYER" }
    };

    var ArrowKeys = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, W: 87, S: 83 };
    // -------------------

    // Utility functions
    var log = function (message) {
        if (typeof console != "undefined" && typeof console.log != "undefined") {
            console.log(message);
        }
    };

    var msgbox = function (title, message) {
        function alertIt(title, message) {
            alert(title + ": " + message);
        }

        if (typeof jQuery == "undefined") {
            alertIt(title, message);
            return;
        }
        var $msg = jQuery("<span></span>").text(message).attr("title", title);
        if ($msg.dialog == "undefined") {
            alertIt(title, message);
        } else {
            $msg.dialog({ modal: true });
        }
    };
    // ------------------

    // Game object
    var game = {};

    // Game constants:
    game.fps = 60; // desired frames per second, should only be used in IE < 10
    game.xpadding = 36; // size of space "behind" each paddle

    // Game initialization:
    game.state = GameState.NEW_GAME_STARTED;
    game.mode = GameMode.ONE_PLAYER; // one player is the default (TODO: menu to choose mode and start game when ready)
    //game.mode = GameMode.TWO_PLAYER;

    game.score = {};
    game.score.onePlayer = {
        points: 0, // in one player mode, the player is continously awarded points so long as he can stay alive playing himself
        INCREMENT_AMOUNT: 20, // constant (is this best practice naming?)
        INCREMENT_EVERY: 120 // every 120 animation frames, or about every 2 seconds
    };
    game.score.twoPlayer = {
        leftScore: 0,
        rightScore: 0,
        WINNING_SCORE: 10
    };

    game.frameCounter = 0; // used to determine when to update points

    // Game canvas initialization:
    game.canvas = document.createElement("canvas"); // this has to be done here instead of in game.init in order for Intellisense to work correctly
    game.canvasCtx = game.canvas.getContext('2d');
    game.canvasDimensions = new Dimensions(800, 600); // this was done because DOM reading (e.g. canvas.width) is too slow to happen during the game loop (http://blogs.msdn.com/b/eternalcoding/archive/2012/03/22/unleash-the-power-of-html-5-canvas-for-gaming-part-1.aspx)

    // Game entities:
    game.entities = {
        leftPaddle: new PlayerPaddle(), // this is a bit wasteful because I instantiate new objects as soon as a new game starts (which happens below).  But I need this for Intellisense.
        rightPaddle: new PlayerPaddle(),
        ball: new Ball()
    };

    // Initialization triggered by pong.start:
    game.init = function (containerId) {

        // Setup canvas and add to specified container:
        this.canvas.id = "pongCanvas";
        this.canvas.width = game.canvasDimensions.width;
        this.canvas.height = game.canvasDimensions.height;
        document.getElementById(containerId).appendChild(this.canvas);

        // Set font (do it here so it only needs to be set once):
        this.canvasCtx.font = "24px Tahoma";

        // More init work:
        this.bindUserInputEvents();

        this.run();
    };

    // Register keyboard event handlers
    // Gamepad registration could be done here too
    game.bindUserInputEvents = function () {
        document.body.onkeydown = function (e) {
            e = e || window.event;
            var keycode = e.keycode || e.which || e.charCode;
            var bubbleEvent = true;
            if (keycode === ArrowKeys.DOWN) {
                game.entities.rightPaddle.moveDown(game.canvasDimensions);
                bubbleEvent = false;
            } else if (keycode == ArrowKeys.UP) {
                game.entities.rightPaddle.moveUp(game.canvasDimensions);
                bubbleEvent = false;
            } else if (keycode == ArrowKeys.S) {
                game.entities.leftPaddle.moveDown(game.canvasDimensions);
                bubbleEvent = false;
            } else if (keycode == ArrowKeys.W) {
                game.entities.leftPaddle.moveUp(game.canvasDimensions);
                bubbleEvent = false;
            }
            return bubbleEvent;
        };
    };

    // Called with each new request for an animation frame and when init is done
    game.run = function () {
        if (game.state !== GameState.PAUSED && game.state !== GameState.GAME_OVER) {
            game.update();
            game.draw();
        }
        game.queueNewFrame(game.run); // this causes the current function to be called again when the browser is ready to display another frame
    };

    // The main logic in the game:
    game.update = function () {
        var isUpdated = true;

        switch (this.state) {

        case GameState.NEW_GAME_STARTED:
            this.resetScore();
            this.resetEntityStates();
            this.pauseTemporarily(2000); // small delay before ball gets moving and play starts
            break;

        case GameState.GAME_IN_PROGRESS:
            this.updateEntityStates(); // move everything based on its last position and current velocity
            var goalScored = this.checkAndAdjustBallTrajectory();
            if (goalScored) { // someone scored:
                if (this.isGameOver(goalScored)) {
                    this.gameOver();
                } else {
                    this.resetBall(); // No winner yet. Game continues, ball and paddles need to be reset back to their starting points to see who scores next.
                }
            } else { // no one scored on this update:
                this.updateOnePlayerScore(); // player stayed alived and is eligible for points
            }
            break;

        default: // other states such as PAUSED
            isUpdated = false;
            break;
        }

        return isUpdated;
    };

    game.isGameOver = function (goalScored) {
        // In one player mode the game ends as soon as the ball is lost, in 2 player mode when the WINNING_SCORE is reached by the left or right player
        var winningScore = this.score.twoPlayer.WINNING_SCORE;
        var isGameOver = ((this.mode === GameMode.ONE_PLAYER && goalScored) || this.score.twoPlayer.leftScore >= winningScore || this.score.twoPlayer.rightScore >= winningScore);
        return isGameOver;
    };

    game.gameOver = function () {
        this.state = GameState.GAME_OVER;
        if (this.mode === GameMode.ONE_PLAYER) {
            msgbox("Game over", "You scored " + this.score.onePlayer.points + " points.  Try to stay alive longer next time.\r\n\r\n(Refresh browser to play again)");
        } else {
            var winner = "Left";
            if (this.score.twoPlayer.rightScore >= this.score.twoPlayer.leftScore) {
                winner = "Right";
            }
            msgbox("Game over", winner + " wins!");
        }
    };

    game.updateOnePlayerScore = function () {

        // Ensure we are in 1 player mode:
        if (this.mode !== GameMode.ONE_PLAYER) { return; }

        // Award points based on the number of animation frames that have gone by:
        game.frameCounter++;
        if (game.frameCounter >= game.score.onePlayer.INCREMENT_EVERY) {
            // At least 120 animation frames went by, so we will award the player some points for staying alive:
            game.score.onePlayer.points += game.score.onePlayer.INCREMENT_AMOUNT;
            // Reset the counter:
            game.frameCounter = 0;
        }

    };

    game.pauseTemporarily = function (pauseMilliseconds) {
        // Draw what we've got before freezing the display:
        this.draw();

        // Let the game loop know that we're pausing for a while:
        this.state = GameState.PAUSED;

        // Unpause after 1.5 seconds:
        window.setTimeout(function () { game.state = GameState.GAME_IN_PROGRESS; }, pauseMilliseconds);
    };

    game.draw = function () {

        // Wipe canvas clean:
        this.clearEntitiesFromCanvas();

        // Draw the entities (paddles and ball):
        var entityName;
        for (entityName in this.entities) {
            if (this.entities.hasOwnProperty(entityName)) {
                this.entities[entityName].draw(game.canvasCtx);
            }
        }

        this.drawScore();

    };

    game.drawScore = function () {
        // In a one player game, there is one score displayed (game.score) which reflects how long the player has managed to stay alive playing himself.
        // In a two player game, each paddle (player) has a score displayed near that paddle.

        if (this.mode === GameMode.ONE_PLAYER) {
            var scoreMessage = "Score: " + this.score.onePlayer.points;

            var textLeftPos = (this.canvasDimensions.width - this.canvasCtx.measureText(scoreMessage).width) / 2;
            var textTopPos = this.canvasDimensions.height - 64;
            this.canvasCtx.fillText(scoreMessage, textLeftPos, textTopPos);
        } else { // two player, show left and right scores:
            var verticalMiddle = this.canvasDimensions.height / 2 - 4;
            this.canvasCtx.fillText(this.score.twoPlayer.leftScore, 4, verticalMiddle);
            this.canvasCtx.fillText(this.score.twoPlayer.rightScore, this.canvasDimensions.width - 24, verticalMiddle);
        }
    };

    game.clearEntitiesFromCanvas = function () {
        this.canvasCtx.clearRect(0, 0, this.canvasDimensions.width, this.canvasDimensions.height);
    };

    game.updateEntityStates = function () {
        this.entities.ball.move();
        //this.entities.rightPaddle.move(); //TODO: Make this computer controlled
    };

    game.checkAndAdjustBallTrajectory = function () {
        var goalScored = false; // this is the return value
        var ball = this.entities.ball;

        if (this.entities.leftPaddle.overlapsWith(ball) || this.entities.rightPaddle.overlapsWith(ball)) {
            ball.velocity.xvel = -ball.velocity.xvel; // make the ball go the other way in the left/right direction after a hit (but keep the down/up direction)
        }
        else if (ball.position.y < 0 || ball.position.y > this.canvasDimensions.height) {
            ball.velocity.yvel = -ball.velocity.yvel; // reflect Y velocity if the top or bottom of the screen is hit
        }
        else if (ball.position.x < game.xpadding) {
            this.score.twoPlayer.rightScore++;
            goalScored = true;
        }
        else if (ball.position.x > this.canvasDimensions.width - game.xpadding) {
            this.score.twoPlayer.rightScore++;
            goalScored = true;
        }

        return goalScored;
    };

    game.resetBall = function () {
        // Store old scores:
        //var oldLeftScore = this.score.twoPlayer.leftScore;
        //var oldRightScore = this.score.twoPlayer.rightScore;

        // Reset everything:
        this.resetEntityStates();

        // Restore scores:
        //this.entities.leftPaddle.score = oldLeftScore;
        //this.entities.rightPaddle.score = oldRightScore;

        this.pauseTemporarily(1500);

        // TODO: Call gameover / high score logic in one player mode
    };

    game.resetScore = function () {
        game.score.onePlayer.points = 0;
        game.score.twoPlayer.leftScore = game.score.twoPlayer.rightScore = 0;

        // Left/right paddle scores get reset automatically because they are part of the Paddle entity state
    };

    game.resetEntityStates = function () {
        var leftPaddle = new PlayerPaddle(); // this is the easiest way to reset score, velocity, etc.
        leftPaddle.position = new Position(game.xpadding, (game.canvas.height - leftPaddle.dimensions.height) / 2); // this could not have been defaulted correctly in the constructor because it depends on the canvas dimensions
        this.entities.leftPaddle = leftPaddle;

        var rightPaddle = new PlayerPaddle();
        rightPaddle.position = new Position(game.canvas.width - rightPaddle.dimensions.width - game.xpadding, (game.canvas.height - rightPaddle.dimensions.height) / 2);
        this.entities.rightPaddle = rightPaddle;

        var ball = new Ball();
        ball.position = new Position((game.canvas.width - ball.dimensions.width) / 2, (game.canvas.height - ball.dimensions.height) / 2);
        this.entities.ball = ball;
    };

    // This intermediate function is needed to handle browser prefixes and browsers that do not support "requestAnimationFrame":
    game.queueNewFrame = function (fn) {
        if (window.requestAnimationFrame)
            window.requestAnimationFrame(fn);
        else if (window.msRequestAnimationFrame)
            window.msRequestAnimationFrame(fn);
        else if (window.webkitRequestAnimationFrame)
            window.webkitRequestAnimationFrame(fn);
        else if (window.mozRequestAnimationFrame)
            window.mozRequestAnimationFrame(fn);
        else if (window.oRequestAnimationFrame)
            window.oRequestAnimationFrame(fn);
        else {
            // Make this function do nothing, and use an old school JavaScript timer instead
            this.queueNewFrame = function () {
                // empty function
            };
            this._intervalId = window.setInterval(fn, 1000 / game.fps); // call every 1/60 of a second
            log("Falling back to using setInterval");
        }
    };
    // ---------------------

    // Public methods of "pong":
    pong.start = function (containerId) {
        game.init(containerId);
    };
    // -------------------

}(window.pong = window.pong || {})); // end pong namespace