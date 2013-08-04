/**
 * @fileOverview A JavaScript height field water simulation for Three.js flat planes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 0.1.0
 */

//===================================
// OBSTACLES
//===================================

/**
 * Abstract class for obstacles
 * @constructor
 * @param {THREE.Mesh} mesh
 */
function Obstacle(mesh) {
    this.mesh = mesh;
    this.updateAlways = false;  //updates obstacle representation whenever calculations are done, meant for dynamic obstacles that are always moving
    this.update();
}
Obstacle.prototype.update = function () {
    throw new Error('Abstract method not implemented');
};
Obstacle.prototype.updateObstacleField = function (obstacleField, waterSim, waterHeight) {
    throw new Error('Abstract method not implemented');
};

/**
 * Obstacles that are voxelized
 * @constructor
 * @extends {Obstacle}
 * @param {THREE.Mesh} mesh
 * @param {number} voxelSizeX
 * @param {number} voxelSizeY
 * @param {number} voxelSizeZ
 */
function VoxelizedObstacle(mesh, voxelSizeX, voxelSizeY, voxelSizeZ, globalTransform) {
    this.voxelizer = new SkVoxelizer(mesh, voxelSizeX, voxelSizeY, voxelSizeZ, globalTransform);
    Obstacle.call(this, mesh);
}
VoxelizedObstacle.prototype = Object.create(Obstacle.prototype);
VoxelizedObstacle.prototype.constructor = VoxelizedObstacle;
VoxelizedObstacle.prototype.update = function () {
    this.voxelizer.updateIntersections();
};
VoxelizedObstacle.prototype.updateObstacleField = function (obstacleField, waterSim, waterHeight) {

    if (this.updateAlways) {
        this.update();
    }

    var minIntersectHeight, maxIntersectHeight, intersectionHeights;
    var x, z, idx;
    for (x = this.voxelizer.__xMinMultiple; x <= this.voxelizer.__xMaxMultiple + this.voxelizer.__EPSILON; x += this.voxelizer.voxelSizeX) {
        for (z = this.voxelizer.__zMinMultiple; z <= this.voxelizer.__zMaxMultiple + this.voxelizer.__EPSILON; z += this.voxelizer.voxelSizeZ) {
            intersectionHeights = this.voxelizer.intersectionFirstAndLastHeights;
            if (intersectionHeights && intersectionHeights[x] && intersectionHeights[x][z]) {

                minIntersectHeight = intersectionHeights[x][z][0];
                maxIntersectHeight = intersectionHeights[x][z][1];  //TODO: this assumes only two heights

                //update obstacle field, compare obstacle intersection heights with water mean height
                if (minIntersectHeight < waterHeight && maxIntersectHeight > waterHeight) {
                    idx = waterSim.__calcVertexId(x, z);
                    obstacleField[idx] = 0;
                }
            }
        }
    }
};

/**
 * Obstacle that is a height-field terrain
 * @constructor
 * @extends {Obstacle}
 * @param {THREE.Mesh} mesh
 */
function TerrainObstacle(mesh) {
    this.intersectionHeights = [];
    Obstacle.call(this, mesh);
}
TerrainObstacle.prototype = Object.create(Obstacle.prototype);
TerrainObstacle.prototype.constructor = TerrainObstacle;
TerrainObstacle.prototype.update = function () {
    //since we are using a height-field terrain, we can just get the height without doing intersection tests
    var vertices = this.mesh.geometry.vertices;
    var i, len;
    for (i = 0, len = vertices.length; i < len; i++) {
        this.intersectionHeights[i] = [];
        this.intersectionHeights[i].push(0);
        this.intersectionHeights[i].push(vertices[i].y);
    }
};
TerrainObstacle.prototype.updateObstacleField = function (obstacleField, waterSim, waterHeight) {

    if (this.updateAlways) {
        this.update();
    }

    //compare intersection heights in local space.
    //For terrain obstacle, heights are in local space too, so can just compare directly without transformations.
    var minIntersectHeight, maxIntersectHeight;
    var i, len;
    for (i = 0, len = waterSim.res * waterSim.res; i < len; i++) {
        if (this.intersectionHeights[i]) {

            minIntersectHeight = this.intersectionHeights[i][0];
            maxIntersectHeight = this.intersectionHeights[i][1];  //TODO: this assumes only two heights

            //update obstacle field, compare obstacle intersection heights with water mean height
            if (minIntersectHeight < waterHeight && maxIntersectHeight > waterHeight) {
                obstacleField[i] = 0;
            }
        }
    }
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
    this.__meanHeight = options.meanHeight;

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
        this.velocityField[i] = new THREE.Vector2();  //FIXME: this is used by some sim classes as a scalar
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

    //update obstacle field
    if (this.obstaclesActive) {
        var waterHeight = this.__meanHeight;
        var obstacle, obstacleId;
        for (obstacleId in this.obstacles) {
            if (this.obstacles.hasOwnProperty(obstacleId)) {
                obstacle = this.obstacles[obstacleId];
                obstacle.updateObstacleField(this.obstacleField, this, waterHeight);
            }
        }
    }

    this.sim(dt);
    this.__clearFields();
};

HeightFieldWaterSim.prototype.sim = function (dt) {
    throw new Error('Abstract method not implemented');
};

HeightFieldWaterSim.prototype.setMeanHeight = function (meanHeight) {

    this.__meanHeight = meanHeight;

    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //set edge vertices to mean height
    var i, j, idx;
    j = 0;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        v[idx].y = this.__meanHeight;
    }
    j = resMinusOne;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        v[idx].y = this.__meanHeight;
    }
    i = 0;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        v[idx].y = this.__meanHeight;
    }
    i = resMinusOne;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        // this.field1[idx] = this.__meanHeight;
        // this.field2[idx] = this.__meanHeight;
        v[idx].y = this.__meanHeight;
    }
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

    this.disturbById(idx, amount);
};

HeightFieldWaterSim.prototype.disturbById = function (id, amount) {
    this.sourceField[id] = amount;
};

HeightFieldWaterSim.prototype.disturbNeighbours = function (position, amount) {

    //convert back to local space first
    this.__worldMatInv.getInverse(this.mesh.matrixWorld);
    this.__localPos.copy(position).applyMatrix4(this.__worldMatInv);

    //calculate idx
    var idx = this.__calcVertexId(this.__localPos.x, this.__localPos.z);

    this.disturbNeighboursById(idx, amount);
};

HeightFieldWaterSim.prototype.disturbNeighboursById = function (id, amount) {

    var vertices = this.geometry.vertices;

    //neighbour (x+1,z)
    var neighbourId = id + this.res;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x-1,z)
    neighbourId = id - this.res;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x,z+1)
    neighbourId = id + 1;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }

    //neighbour (x,z-1)
    neighbourId = id - 1;
    if (vertices[neighbourId]) {
        this.disturbById(neighbourId, amount);
    }
};

HeightFieldWaterSim.prototype.addObstacle = function (obstacle, name) {
    // DepthMapObstacleManager.addObstacle(mesh);
    if (!(obstacle instanceof Obstacle)) {
        throw new Error('obstacle must be of type Obstacle');
    }
    if (typeof name !== 'string') {
        throw new Error('name must be of type string');
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

    //set mesh back to 0
    var i;
    var v = this.geometry.vertices;
    for (i = 0; i < this.numVertices; i++) {
        v[i].y = this.__meanHeight;
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
            //mask using obstacle field, relative to the mean height
            v[idx].y = (v[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
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
            //mask using obstacle field, relative to the mean height
            v[idx].y = (v[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
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

    //TODO: this should be in superclass
    var geometry = new THREE.Geometry();
    var i, len;
    for (i = 0, len = 2 * this.mesh.geometry.vertices.length; i < len; i++) {
        geometry.vertices.push(new THREE.Vector3());
        if (i % 2 === 0) {
            geometry.colors.push(new THREE.Color(0xff0000));
        } else {
            geometry.colors.push(new THREE.Color(0x00ff00));
        }
    }
    var material = new THREE.LineBasicMaterial({vertexColors: THREE.VertexColors});
    this.velVisualizeMesh = new THREE.Line(geometry, material, THREE.LinePieces);
    if (options.scene) {
        options.scene.add(this.velVisualizeMesh);
    }
}
//inherit from HeightFieldWaterSim
HeightFieldWaterSim_xWater.prototype = Object.create(HeightFieldWaterSim.prototype);
HeightFieldWaterSim_xWater.prototype.constructor = HeightFieldWaterSim_xWater;
//override
HeightFieldWaterSim_xWater.prototype.init = function () {

    //init fields first
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.__meanHeight;
        this.field2[i] = this.__meanHeight;
    }

    //call super class init to initialize other fields
    HeightFieldWaterSim.prototype.init.call(this);
};
HeightFieldWaterSim_xWater.prototype.reset = function () {
    var i;
    for (i = 0; i < this.numVertices; i++) {
        this.field1[i] = this.__meanHeight;
        this.field2[i] = this.__meanHeight;
    }

    HeightFieldWaterSim.prototype.reset.call(this);
};
HeightFieldWaterSim_xWater.prototype.setMeanHeight = function (meanHeight) {

    this.__meanHeight = meanHeight;

    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    //set edge vertices to mean height
    var i, j, idx;
    j = 0;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    j = resMinusOne;
    for (i = 0; i < this.res; i++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    i = 0;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }
    i = resMinusOne;
    for (j = 1; j < resMinusOne; j++) {
        idx = i * this.res + j;
        this.field1[idx] = this.__meanHeight;
        this.field2[idx] = this.__meanHeight;
    }

    HeightFieldWaterSim.prototype.setMeanHeight.call(this, meanHeight);
};
HeightFieldWaterSim_xWater.prototype.sim = function (dt) {

    var i, j, idx;
    var v = this.geometry.vertices;
    var resMinusOne = this.res - 1;

    dt = 1.0 / 60.0;  //fix dt

    //add source and obstacles first
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field1[idx] += this.sourceField[idx];
            //mask using obstacle field, relative to the mean height
            this.field1[idx] = (this.field1[idx] - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;
        }
    }

    //propagate
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            this.field2[idx] = (this.field1[(i - 1) * this.res + j] + this.field1[(i + 1) * this.res + j] + this.field1[i * this.res + (j - 1)] + this.field1[i * this.res + (j + 1)]) / 2.0 - this.field2[idx];
            //scale down using damping factor, relative to the mean height
            this.field2[idx] = (this.field2[idx] - this.__meanHeight) * this.dampingFactor + this.__meanHeight;
        }
    }

    //update vertex heights
    for (i = 1; i < resMinusOne; i++) {
        for (j = 1; j < resMinusOne; j++) {
            idx = i * this.res + j;
            v[idx].y = this.field2[idx];
        }
    }

    // //update velocity fields
    // var g = -9.81;
    // for (i = 1; i < resMinusOne; i++) {
        // for (j = 1; j < resMinusOne; j++) {
            // idx = i * this.res + j;
            // this.velocityField[idx].x = (g / this.segmentSize) * (v[idx + this.res].y - v[idx].y) * dt;
            // this.velocityField[idx].y = (g / this.segmentSize) * (v[idx + 1].y - v[idx].y) * dt;
        // }
    // }
    // this.updateVelColors();
    // this.updateVelVisualizer();

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
HeightFieldWaterSim_xWater.prototype.updateVelColors = function () {

    //TODO: this should go into superclass. Not putting it yet because I want to test it on xwater only.

    //update colors using velocity field
    var faceIndices = ['a', 'b', 'c', 'd'];

    //TODO: these should all be instance var
    var minVel = 0;
    var maxVel = 0.2;
    var baseColor = new THREE.Color(0x0066cc);

    var i, len, f, j, n, vertexIndex, velMag, color;
    for (i = 0, len = this.geometry.faces.length; i < len; i ++) {
        f  = this.geometry.faces[i];
        n = (f instanceof THREE.Face3) ? 3 : 4;
        for (j = 0; j < n; j++) {

            vertexIndex = f[faceIndices[j]];

            velMag = this.velocityField[vertexIndex].length() / (maxVel - minVel) + minVel;
            velMag = THREE.Math.clamp(velMag, 0, 1);

            //linear interpolate between the base and water color using velMag
            color = new THREE.Color(0x99ffff);  //TODO: don't recreate every frame
            color.lerp(baseColor, 1 - velMag);

            f.vertexColors[j] = color;
        }
    }
    this.geometry.colorsNeedUpdate = true;
};
HeightFieldWaterSim_xWater.prototype.updateVelVisualizer = function () {

    //TODO: this should go into superclass. Not putting it yet because I want to test it on xwater only.

    //TODO: transform into another space

    var i, len, start, end, offset;
    // var mat = this.mesh.matrixWorld;
    for (i = 0, len = this.mesh.geometry.vertices.length; i < len; i++) {
        start = this.mesh.geometry.vertices[i]; //.clone().applyMatrix4(mat);
        offset = new THREE.Vector3(this.velocityField[i].x, 0, this.velocityField[i].y);
        // offset.transformDirection(mat);
        offset.multiplyScalar(10);
        end = start.clone().add(offset);
        this.velVisualizeMesh.geometry.vertices[2 * i].copy(start);
        this.velVisualizeMesh.geometry.vertices[2 * i + 1].copy(end);
    }
    this.velVisualizeMesh.geometry.verticesNeedUpdate = true;
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

    //FIXME: fix weird boundaries when using mean height

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
                //mask using obstacle field, relative to the mean height
                // v[idx].y *= this.obstacleField[idx];
                v[idx].y = (v[idx].y - this.__meanHeight) * this.obstacleField[idx] + this.__meanHeight;

                //also remove mean height so that everything is back to 0-height
                v[idx].y -= this.__meanHeight;
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

                //do the algo
                temp = v[idx].y;
                v[idx].y = (v[idx].y * twoMinusDampTimesDt
                            - this.prevHeight[idx]
                            - this.vertDeriv[idx] * gravityTimesDtTimesDt) / onePlusDampTimesDt;
                this.prevHeight[idx] = temp;

                //move back to mean height
                v[idx].y += this.__meanHeight;
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