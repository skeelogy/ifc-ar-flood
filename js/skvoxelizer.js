/**
 * @fileOverview A JavaScript voxelizer for Three.js meshes
 * @author Skeel Lee <skeel@skeelogy.com>
 * @version 1.0.0
 */

/**
 * Voxelizer for <tt>mesh</tt>
 * @constructor
 * @param {THREE.Mesh} mesh Mesh to voxelize from
 * @param {number} voxelSizeX Voxel size in X
 * @param {number} voxelSizeY Voxel size in Y
 * @param {number} voxelSizeZ Voxel size in Z
 * @param {THREE.Matrix4} transformMatrix Transform matrix to change the space of the voxelizing
 */
function SkVoxelizer(mesh, voxelSizeX, voxelSizeY, voxelSizeZ, transformMatrix) {

    this.mesh = mesh;
    this.voxelSizeX = voxelSizeX || 1;
    this.voxelSizeY = voxelSizeY || 1;
    this.voxelSizeZ = voxelSizeZ || 1;
    this.transformMatrix = transformMatrix || new THREE.Matrix4();

    this.__EPSILON = 0.001;

    this.geometry = mesh.geometry;
    this.mesh.material.side = THREE.DoubleSide;  //make sure that the material is double sided for intersection test to work properly

    this.voxelData = {};
    this.intersectionFirstAndLastHeights = {};

    //if bounding box does not exist, force generate it first
    if (!this.geometry.boundingBox) {
        this.geometry.computeBoundingBox();
    }
    //store some private variables for calculations later
    this.bbox = this.geometry.boundingBox;
    this.__min = new THREE.Vector3();
    this.__max = new THREE.Vector3();
    this.__transformedBbox = this.bbox.clone();
    this.__xMinMultiple = 0;
    this.__xMaxMultiple = 0;
    this.__yMinMultiple = 0;
    this.__yMaxMultiple = 0;
    this.__zMinMultiple = 0;
    this.__zMaxMultiple = 0;

    //store some private variables for intersection test
    this.__voxelMeshes = {};
    this.__raycaster = new THREE.Raycaster();
    // this.__raycaster.precision = 0.1;
    this.__startPoint = new THREE.Vector3(0, -99999, 0);
    this.__up = new THREE.Vector3(0, 1, 0);
    this.__mat = new THREE.Matrix4();

    //store some private variables for voxel mesh generation
    this.__voxelGeom = new THREE.CubeGeometry(this.voxelSizeX, this.voxelSizeY, this.voxelSizeZ);
    this.__voxelMaterial = new THREE.MeshPhongMaterial();
}

SkVoxelizer.prototype.__updateMinMax = function () {

    //get a matrix that represents conversion to transform's space
    this.__mat.getInverse(this.transformMatrix);
    this.__mat.multiply(this.mesh.matrixWorld);

    //create AABB that is in transform's space
    var transformedAabb = this.__transformedBbox.copy(this.bbox).applyMatrix4(this.__mat);
    this.__min = transformedAabb.min;
    this.__max = transformedAabb.max;

    //update the min/max multiples (in transform's space)
    this.__xMinMultiple = Math.ceil(this.__min.x / this.voxelSizeX) * this.voxelSizeX;
    this.__xMaxMultiple = Math.floor(this.__max.x / this.voxelSizeX) * this.voxelSizeX;
    this.__yMinMultiple = Math.ceil(this.__min.y / this.voxelSizeY) * this.voxelSizeY;
    this.__yMaxMultiple = Math.floor(this.__max.y / this.voxelSizeY) * this.voxelSizeY;
    this.__zMinMultiple = Math.ceil(this.__min.z / this.voxelSizeZ) * this.voxelSizeZ;
    this.__zMaxMultiple = Math.floor(this.__max.z / this.voxelSizeZ) * this.voxelSizeZ;
};

/**
 * Updates the first and last intersection data
 */
SkVoxelizer.prototype.updateIntersections = function () {

    //cast rays from bottom up and keep list of first and last intersections
    //based on ray stabbing method from "Simplification and Repair of Polygonal Models Using Volumetric Techniques", F. S. Nooruddin and G. Turk

    //NOTE: this assumes that the mesh is well-defined (water-tight, no self-intersections etc),
    //so I'm not doing multiple projections as suggested in the paper to handle difficult cases yet.

    //TODO: implement parity check method so that it works on more complex shapes such as a torus knot

    //get min and max of bounding box in world space
    this.__updateMinMax();

    //cast ray upwards from each (x,z) point and detect intersection with mesh
    // Math.seedrandom(1);  //FIXME: conflicts with other random seedings
    var x, z;
    var intersectInfo;
    for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX) {
        this.intersectionFirstAndLastHeights[x] = {};
        for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ) {

            //get first and last intersection points
            this.__startPoint.x = x; // + Math.random() * this.__EPSILON;  //need to add small random offsets to prevent hitting exactly on vertices which causes intersection test to fail
            this.__startPoint.z = z; // + Math.random() * this.__EPSILON;  //need to add small random offsets to prevent hitting exactly on vertices which causes intersection test to fail

            //create a ray in world space
            this.__raycaster.set(
                this.__startPoint.clone().applyMatrix4(this.transformMatrix),
                this.__up.clone().transformDirection(this.transformMatrix)
            );

            //get world space intersect info
            intersectInfo = this.__raycaster.intersectObject(this.mesh);
            if (intersectInfo && intersectInfo.length >= 2) {
                //convert intersectInfo back to local space
                this.__mat.getInverse(this.transformMatrix);
                var p1 = intersectInfo[0].point.applyMatrix4(this.__mat);
                var p2 = intersectInfo[intersectInfo.length - 1].point.applyMatrix4(this.__mat);

                this.intersectionFirstAndLastHeights[x][z] = [];
                this.intersectionFirstAndLastHeights[x][z].push(p1.y);
                this.intersectionFirstAndLastHeights[x][z].push(p2.y);
            }
        }
    }
};

/**
 * Voxelizes the mesh
 */
SkVoxelizer.prototype.voxelize = function () {

    //calculate the intersection points first
    this.updateIntersections();

    //do the voxelization
    var x, y, z;
    var count = 0;
    for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX) {
        this.voxelData[x] = {};
        for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ) {
            this.voxelData[x][z] = {};
            for (y = this.__yMinMultiple; y <= this.__yMaxMultiple + this.__EPSILON; y += this.voxelSizeY) {
                //check y against the intersection boundaries for this (x,z) value
                if (this.intersectionFirstAndLastHeights[x][z]) {
                    if (y <= this.intersectionFirstAndLastHeights[x][z][0] || y >= this.intersectionFirstAndLastHeights[x][z][1]) {
                        this.voxelData[x][z][y] = 0;
                    } else {
                        this.voxelData[x][z][y] = 1;
                    }
                }
            }
        }
    }
};

/**
 * Hides all voxels
 */
SkVoxelizer.prototype.hideAllVoxels = function () {
    var x, y, z, xId, zId, yId;
    for (xId in this.__voxelMeshes) {
        if (this.__voxelMeshes.hasOwnProperty(xId)) {
            x = this.__voxelMeshes[xId];
            for (zId in z) {
                if (this.__voxelMeshes.hasOwnProperty(zId)) {
                    x = x[zId];
                    for (yId in z) {
                        if (this.__voxelMeshes.hasOwnProperty(yId)) {
                            y = z[yId];
                            y.visible = false;
                        }
                    }
                }
            }
        }
    }
};

/**
 * Visualize the voxels. Use this for debugging purposes only. It is very slow.
 * @param  {THREE.Scene} scene Scene
 */
SkVoxelizer.prototype.visualize = function (scene) {

    //turn off all voxels first
    this.hideAllVoxels();

    //show voxel mesh if voxel data has value of 1
    var x, y, z, thisVoxelMesh;
    for (x = this.__xMinMultiple; x <= this.__xMaxMultiple + this.__EPSILON; x += this.voxelSizeX) {
        if (!this.__voxelMeshes[x]) {
            this.__voxelMeshes[x] = {};
        }
        for (z = this.__zMinMultiple; z <= this.__zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ) {
            if (!this.__voxelMeshes[x][z]) {
                this.__voxelMeshes[x][z] = {};
            }
            for (y = this.__yMinMultiple; y <= this.__yMaxMultiple + this.__EPSILON; y += this.voxelSizeY) {
                //create a new voxel mesh if it has not been created at this space previously
                if (!this.__voxelMeshes[x][z][y]) {
                    thisVoxelMesh = new THREE.Mesh(this.__voxelGeom, this.__voxelMaterial);
                    this.__voxelMeshes[x][z][y] = thisVoxelMesh;
                    thisVoxelMesh.position.x = x;
                    thisVoxelMesh.position.y = y;
                    thisVoxelMesh.position.z = z;
                    thisVoxelMesh.visible = false;
                    scene.add(thisVoxelMesh);
                }

                //show the voxel mesh if voxel data is 1
                if (this.voxelData[x][z][y] === 1) {
                    this.__voxelMeshes[x][z][y].visible = true;
                }
            }
        }
    }
};