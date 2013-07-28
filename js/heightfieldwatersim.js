/**
 * @fileOverview A JavaScript height field water simulation for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 */

//===================================
// OBSTACLES
//===================================

/**
 * Obstacles for height field water sim
 * @constructor
 * @param {THREE.Mesh} mesh
 */
function Obstacle(mesh) {
    this.mesh = mesh;
    this.intersectionHeights = [];
    this.intersectionHeightsNeedUpdate = false;

    this.update();
}
Obstacle.prototype.update = function () {
    var vertices = this.mesh.geometry.vertices;
    var i, len;
    for (i = 0, len = vertices.length; i < len; i++) {
        this.intersectionHeights[i] = [];
        this.intersectionHeights[i].push(0);
        this.intersectionHeights[i].push(vertices[i].y);
    }
};
Obstacle.prototype.getIntersectionHeights = function () {
    return this.intersectionHeights;
};

//TODO: obsolete, should be removed
var DepthMapObstacleManager = {

    depthMapSize: 10,
    depthMapRes: 512,
    depthMapNear: -2,
    depthMapFar: 2,

    init: function () {
        this.__loadScene();
        this.__prepareDepthMapImageElements();
    },

    update: function () {
        this.depthMapRenderer.autoClear = false;
        this.depthMapRenderer.clear();
        this.depthMapRenderer.render(this.depthMapScene, this.depthMapCamera);

        //update obstacle depth map image display
        this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
    },

    addObstacle: function (mesh) {
        //create another mesh with the same geometry, but with a MeshDepthMaterial
        var depthMesh = new THREE.Mesh(
            mesh.geometry,
            new THREE.MeshDepthMaterial({side: THREE.DoubleSide, overdraw: true})
        );

        //do a reference copy of position, rotation and scale, so that will auto-update
        //TODO: not sure why cannot just get matrix from mesh and apply to depthMesh
        depthMesh.position = mesh.position;
        depthMesh.rotation = mesh.rotation;
        depthMesh.scale = mesh.scale;

        this.depthMapScene.add(depthMesh);
    },

    getObstacleDepthMap: function () {
        return this.obstacleDepthMapCanvasElemContext.getImageData(0, 0, this.depthMapRes, this.depthMapRes).data;
    },

    __loadScene: function () {
        if (!this.depthMapRenderer) {
            this.depthMapRenderer = new THREE.CanvasRenderer({
                antialias : true
            });
            this.depthMapRenderer.setSize(this.depthMapRes, this.depthMapRes);
            this.depthMapRenderer.setClearColor('#000000', 1);
            this.obstacleDepthMapCanvasElemContext = this.depthMapRenderer.domElement.getContext('2d');

            this.depthMapScene = new THREE.Scene();

            var halfSize = this.depthMapSize / 2.0;
            this.depthMapCamera = new THREE.OrthographicCamera(-halfSize, halfSize, -halfSize, halfSize, this.depthMapNear, this.depthMapFar);
            this.depthMapCamera.rotation.x = THREE.Math.degToRad(90);
            this.depthMapCamera.position.y = 0;
        }
    },

    __prepareDepthMapImageElements: function () {
        //load original terrain image, scale it using canvas, then set scaled image to $scaledImageObj
        if (!this.$depthMapImageObj) {
            this.$depthMapImageObj = $(new Image());
            this.$depthMapImageObj[0].src = this.depthMapRenderer.domElement.toDataURL();
            this.$depthMapImageObj.css({'position': 'fixed', 'top': '55px', 'left': 0});
            $('body').append(this.$depthMapImageObj);
        }
    }

};

//===================================
// HEIGHT FIELD WATER SIMS
//===================================

/**
 * Abstract base class for height field water simulations
 * @constructor
 * @param {THREE.Mesh} mesh
 * @param {number} size
 * @param {number} res
 * @param {number} dampingFactor
 * @param {number} meanHeight
 */
function HeightFieldWaterSim(options) {

    if (options.mesh === 'undefined') { throw new Error('mesh not specified'); }
    this.mesh = options.mesh;
    if (options.size === 'undefined') { throw new Error('size not specified'); }
    this.size = options.size;
    this.halfSize = this.size / 2.0;
    if (options.res === 'undefined') { throw new Error('res not specified'); }
    this.res = options.res;
    if (options.dampingFactor === 'undefined') { throw new Error('dampingFactor not specified'); }
    this.dampingFactor = options.dampingFactor;
    if (options.meanHeight === 'undefined') { throw new Error('meanHeight not specified'); }
    this.meanHeight = options.meanHeight;

    this.geometry = this.mesh.geometry;
    this.numVertices = this.res * this.res;
    if (this.numVertices !== this.geometry.vertices.length) {
        throw new Error('Number of vertices in mesh does not match res*res');
    }
    this.segmentSize = this.size / this.res;
    this.segmentSizeSquared = this.segmentSize * this.segmentSize;

    this.obstacles = {};

    this.velocityField = [];
    this.sourceField = [];
    this.obstacleField = [];

    // DepthMapObstacleManager.depthMapSize = this.size;
    // DepthMapObstacleManager.depthMapRes = this.res;
    // DepthMapObstacleManager.depthMapNear = -2;
    // DepthMapObstacleManager.depthMapFar = 2;

    this.obstaclesActive = true;
    //FIXME: remove these hardcoded values
    this.clampMin = 0.48;
    this.clampMax = 0.68;

    //some temp variables to prevent recreation every frame
    this.__worldMatInv = new THREE.Matrix4();
    this.__localPos = new THREE.Vector3();

    this.init();
}

HeightFieldWaterSim.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.velocityField[i] = 0;
        this.sourceField[i] = 0;
        this.obstacleField[i] = 1;
    }

    //init DepthMapObstacleManager
    // DepthMapObstacleManager.init();
};

HeightFieldWaterSim.prototype.update = function (dt) {

    // DepthMapObstacleManager.update();

    // //update obstacle field using the depth map
    // if (this.obstaclesActive) {
    //     var obstacleDepthMapData = DepthMapObstacleManager.getObstacleDepthMap();
    //     var i, len;
    //     var norm;
    //     for (i = 0, len = this.res * this.res; i < len; i++) {
    //         norm = obstacleDepthMapData[i * 4] / 255.0;
    //         this.obstacleField[i] = 1 - (norm >= this.clampMin && norm <= this.clampMax);
    //     }
    // }

    // //update obstacles first
    // var obstacle, obstacleId;
    // for (obstacleId in this.obstacles) {
    //     if (this.obstacles.hasOwnProperty(obstacleId)) {
    //         obstacle = this.obstacles[obstacleId];
    //         obstacle.update();
    //     }
    // }

    var waterHeight;
    // var v = this.geometry.vertices;
    var minIntersectHeight, maxIntersectHeight;
    var i, len;
    for (i = 0, len = this.res * this.res; i < len; i++) {

        //NOTE: must use mean height to compare, rather than v[i].y.
        //The latter will cause unstable behaviour because obstacles detection test passes and fails as water geometry height varies.
        waterHeight = this.meanHeight;
        // waterHeight = v[i].y;

        var obstacle, obstacleId;
        for (obstacleId in this.obstacles) {
            if (this.obstacles.hasOwnProperty(obstacleId)) {

                obstacle = this.obstacles[obstacleId];

                if (obstacle.intersectionHeights[i]) {

                    minIntersectHeight = obstacle.intersectionHeights[i][0];
                    maxIntersectHeight = obstacle.intersectionHeights[i][1];  //TODO: this assumes only two heights

                    //update obstacle field, compare obstacle intersection heights with water mean height
                    if (minIntersectHeight < waterHeight && maxIntersectHeight > waterHeight) {
                        this.obstacleField[i] = 0;
                    }
                }

            }
        }

    }

    this.sim(dt);
    this.__clearFields();
};

HeightFieldWaterSim.prototype.sim = function (dt) {
    throw new Error('Abstract method not implemented');
};

/**
 * Calculates the vertex id of the mesh that is nearest <tt>position</tt>
 * @param  {THREE.Vector3} position
 * @return {number}
 */
HeightFieldWaterSim.prototype.__calcVertexId = function (x, z) {
    var row = Math.floor((z + this.halfSize) / this.size * this.res);
    var col = Math.floor((x + this.halfSize) / this.size * this.res);
    return (row * this.res) + col;
};

HeightFieldWaterSim.prototype.disturb = function (position, amount) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    //calculate idx
    var idx = this.__calcVertexId(this.__localPos.x, this.__localPos.z);

    this.sourceField[idx] = amount;
};

HeightFieldWaterSim.prototype.addObstacle = function (obstacle, name) {
    // DepthMapObstacleManager.addObstacle(mesh);
    if (!(obstacle instanceof Obstacle)) {
        throw new Error('obstacle must be of type Obstacle');
    }
    if (Object.keys(this.obstacles).indexOf(name) !== -1) {
        throw new Error('obstacle name already exists: ' + name);
    }
    this.obstacles[name] = obstacle;
};

HeightFieldWaterSim.prototype.setObstaclesActive = function (isActive) {
    this.obstaclesActive = isActive;
};

HeightFieldWaterSim.prototype.reset = function () {

    console.log('reset water');

    //set mesh back to 0
    var i;
    var v = this.geometry.vertices;
    for (i = 0; i < this.numVertices; i++) {
        v[i].y = this.meanHeight;
    }

    //clear fields
    this.__clearFields();
};

HeightFieldWaterSim.prototype.__clearFields = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.sourceField[i] = 0;
        this.obstacleField[i] = 1;
    }
};

HeightFieldWaterSim.prototype.__updateMesh = function () {
    this.geometry.verticesNeedUpdate = true;
    this.geometry.computeFaceNormals();  //must call this first before computeVertexNormals()
    this.geometry.computeVertexNormals();
    this.geometry.normalsNeedUpdate = true;
};

/**
 * Height field water simulation based on HelloWorld code of "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {HeightFieldWaterSim}
 */
function HeightFieldWaterSim_Muller_GDC2008_HelloWorld(options) {
    HeightFieldWaterSim.call(this, options);
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype.constructor = HeightFieldWaterSim_Muller_GDC2008_HelloWorld;
//override
HeightFieldWaterSim_Muller_GDC2008_HelloWorld.prototype.sim = function (dt) {

    var i, j, idx;
    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //apply source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y += this.sourceField[idx];
            v[idx].y *= this.obstacleField[idx];
        }
    }

    //propagate
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.velocityField[idx] += (v[(i - 1) * this.res + j].y + v[(i + 1) * this.res + j].y + v[i * this.res + (j - 1)].y + v[i * this.res + (j + 1)].y) / 4.0 - v[idx].y;
            this.velocityField[idx] *= this.dampingFactor;
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y += this.velocityField[idx];
        }
    }

    //update mesh
    this.__updateMesh();
};

/**
 * Height field water simulation based on "Fast Water Simulation for Games Using Height Fields" (Matthias Mueller-Fisher, GDC2008)
 * @constructor
 * @extends {HeightFieldWaterSim}
 */
function HeightFieldWaterSim_Muller_GDC2008(options) {
    HeightFieldWaterSim.call(this, options);

    if (options.horizontalSpeed === 'undefined') { throw new Error('horizontalSpeed not specified'); }
    this.horizontalSpeed = options.horizontalSpeed;
    this.horizontalSpeedSquared = this.horizontalSpeed * this.horizontalSpeed;
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Muller_GDC2008.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Muller_GDC2008.prototype.constructor = HeightFieldWaterSim_Muller_GDC2008;
//override
HeightFieldWaterSim_Muller_GDC2008.prototype.sim = function (dt) {

    //fixing dt: better to be in slow motion than to explode
    dt = 1.0 / 60.0;

    var i, j, idx;
    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //add source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y += this.sourceField[idx];
            v[idx].y *= this.obstacleField[idx];
        }
    }

    //calculate vertical acceleration and velocity
    var acc;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            acc = this.horizontalSpeedSquared * (
                v[idx + this.res].y    //height[i+1,j]
                + v[idx - this.res].y  //height[i-1,j]
                + v[idx + 1].y         //height[i,j+1]
                + v[idx - 1].y         //height[i,j-1]
                - 4 * v[idx].y       //4 * height[i,j]
            ) / this.segmentSizeSquared;
            this.velocityField[idx] += acc * dt;  //TODO: use a better integrator
            this.velocityField[idx] *= this.dampingFactor;
        }
    }

    //update vertex heights
    var len = v.length;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y += this.velocityField[idx] * dt;  //TODO: use a better integrator
        }
    }

    //update mesh
    this.__updateMesh();
};

/**
 * Height field water simulation based on http://freespace.virgin.net/hugo.elias/graphics/x_water.htm
 * @constructor
 * @extends {HeightFieldWaterSim}
 */
function HeightFieldWaterSim_xWater(options) {
    this.field1 = [];
    this.field2 = [];

    HeightFieldWaterSim.call(this, options);
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_xWater.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_xWater.prototype.constructor = HeightFieldWaterSim_xWater;
//override
HeightFieldWaterSim_xWater.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.meanHeight;
        this.field2[i] = this.meanHeight;
    }

    //call super class init to initialize other fields
    HeightFieldWaterSim.prototype.init.call(this);
};
HeightFieldWaterSim_xWater.prototype.reset = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.meanHeight;
        this.field2[i] = this.meanHeight;
    }

    HeightFieldWaterSim.prototype.reset.call(this);
};
HeightFieldWaterSim_xWater.prototype.sim = function (dt) {

    var i, j, idx;
    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //add source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field1[idx] += this.sourceField[idx];
            this.field1[idx] *= this.obstacleField[idx];
        }
    }

    //propagate
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field2[idx] = (this.field1[(i - 1) * this.res + j] + this.field1[(i + 1) * this.res + j] + this.field1[i * this.res + (j - 1)] + this.field1[i * this.res + (j + 1)]) / 2.0 - this.field2[idx];
            //scale down using damping factor, relative to the mean height
            this.field2[idx] = (this.field2[idx] - this.meanHeight) * this.dampingFactor + this.meanHeight;
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y = this.field2[idx];
        }
    }

    //update mesh
    this.__updateMesh();

    //swap buffers
    var temp;
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            temp = this.field2[idx];
            this.field2[idx] = this.field1[idx];
            this.field1[idx] = temp;
        }
    }
};

/**
 * Height field water simulation based on "Interactive Water Surfaces" (Jerry Tessendorf, Game Programming Gems 4)
 * @constructor
 * @extends {HeightFieldWaterSim}
 */
function HeightFieldWaterSim_Tessendorf_iWave(options) {

    this.prevHeight = [];
    this.vertDeriv = [];

    HeightFieldWaterSim.call(this, options);

    if (options.kernelRadius === 'undefined') { throw new Error('kernelRadius not specified'); }
    this.kernelRadius = options.kernelRadius;
    if (options.substeps === 'undefined') { throw new Error('substeps not specified'); }
    this.substeps = options.substeps;

    this.gravity = -9.81;

    //load this.G from json file
    var that = this;
    $.getJSON('/python/iWave_kernels_' + this.kernelRadius + '.json', function (data) {
        that.G = data;
    });
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_Tessendorf_iWave.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_Tessendorf_iWave.prototype.constructor = HeightFieldWaterSim_Tessendorf_iWave;
//override
HeightFieldWaterSim_Tessendorf_iWave.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.prevHeight[i] = 0;
        this.vertDeriv[i] = 0;
    }

    //call super class init to initialize other fields
    HeightFieldWaterSim.prototype.init.call(this);
};
HeightFieldWaterSim_Tessendorf_iWave.prototype.reset = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.prevHeight[i] = 0;
        this.vertDeriv[i] = 0;
    }

    HeightFieldWaterSim.prototype.reset.call(this);
};
HeightFieldWaterSim_Tessendorf_iWave.prototype.sim = function (dt) {

    //fixing dt: better to be in slow motion than to explode
    dt = 1.0 / 60.0;

    //TODO: start using events, rather than having this check on every frame
    if (!this.G) {
        return;
    }

    //moving multiple time steps per loop so that the sim can go faster
    var s;
    for (s = 0; s < this.substeps; s++) {

        var i, j, idx;
        var v = this.geometry.vertices;
        var resMinusOne = this.res - 1;

        //add source and obstacles first
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {
                idx = i * this.res + j;
                v[idx].y += this.sourceField[idx];
                v[idx].y *= this.obstacleField[idx];
            }
        }

        //convolve to update this.vertDeriv
        this.__symmetricalConvolve();

        //propagate
        var temp;
        var twoMinusDampTimesDt = 2.0 - this.dampingFactor * dt;
        var onePlusDampTimesDt = 1.0 + this.dampingFactor * dt;
        var gravityTimesDtTimesDt = this.gravity * dt * dt;
        for (i = 1; i < resMinusOne; i++) {
            for (j = 1; j < resMinusOne; j++) {
                idx = i * this.res + j;
                temp = v[idx].y;
                v[idx].y = (v[idx].y * twoMinusDampTimesDt
                            - this.prevHeight[idx]
                            - this.vertDeriv[idx] * gravityTimesDtTimesDt) / onePlusDampTimesDt;
                this.prevHeight[idx] = temp;
            }
        }
    }

    //update mesh
    this.__updateMesh();
};
//methods
HeightFieldWaterSim_Tessendorf_iWave.prototype.__symmetricalConvolve = function () {

    var i, j, k, l, iMax, jMax, idx;
    var v = this.geometry.vertices;
    for (i = this.kernelRadius, iMax = this.res - this.kernelRadius; i < iMax; i++) {
        for (j = this.kernelRadius, jMax = this.res - this.kernelRadius; j < jMax; j++) {

            idx = i * this.res + j;

            //convolve for every pair of [i,j]

            //NOTE: symmetrical convolution forumla in article does not seem to work.
            //I'm doing it the following way to cover all positions of the kernel:

            //add [0,0] first
            this.vertDeriv[idx] = v[idx].y;

            //when k = 0, swap k and l in a specific manner while changing signs
            k = 0;
            for (l = 1; l <= this.kernelRadius; l++) { //article says to start from k+1, but I think it should start from 1 instead
                this.vertDeriv[idx] += this.G[k][l] * (v[(i + k) * this.res + (j + l)].y + v[(i + k) * this.res + (j - l)].y + v[(i + l) * this.res + (j + k)].y + v[(i - l) * this.res + (j + k)].y);
            }

            //for k larger than 0, k and l do not swap at all, only change signs
            for (k = 1; k <= this.kernelRadius; k++) {
                for (l = 1; l <= this.kernelRadius; l++) {  //article says to start from k+1, but I think it should start from 1 instead
                    this.vertDeriv[idx] += this.G[k][l] * (v[(i + k) * this.res + (j + l)].y + v[(i - k) * this.res + (j - l)].y + v[(i + k) * this.res + (j - l)].y + v[(i - k) * this.res + (j + l)].y);
                }
            }

        }
    }
};
HeightFieldWaterSim_Tessendorf_iWave.prototype.__convolve = function () {
    //NOTE: this is not used. I left it here for debugging if necessary.
    var i, j, k, l, iMax, jMax, idx;
    var v = this.geometry.vertices;
    for (i = this.kernelRadius, iMax = this.res - this.kernelRadius; i < iMax; i++) {
        for (j = this.kernelRadius, jMax = this.res - this.kernelRadius; j < jMax; j++) {

            idx = i * this.res + j;

            //convolve for every pair of [i,j]
            this.vertDeriv[idx] = 0;
            for (k = -this.kernelRadius; k <= this.kernelRadius; k++) {
                for (l = -this.kernelRadius; l <= this.kernelRadius; l++) {
                    this.vertDeriv[idx] += this.G[k][l] * v[(i + k) * this.res + (j + l)].y;
                }
            }

        }
    }
};