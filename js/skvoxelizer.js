/*===================================
skvoxelizer.js
@author: Skeel Lee
@contact: skeel@skeelogy.com
@since: 19 Jul 2013
A voxelizer for Three.js meshes
===================================*/

function SkVoxelizer(mesh, voxelSizeX, voxelSizeY, voxelSizeZ)
{
	this.mesh = mesh;
	this.voxelSizeX = voxelSizeX || 1;
	this.voxelSizeY = voxelSizeY || 1;
	this.voxelSizeZ = voxelSizeZ || 1;

	this.__EPSILON = 0.001;

	this.geometry = mesh.geometry;
	//if bounding box does not exist, force generate it first
	if (!this.geometry.boundingBox) this.geometry.computeBoundingBox();
	this.bbox = this.geometry.boundingBox;

	//for intersection test
	this.voxelData = {};
	this.voxelMeshes = null;
	this.intersectionFirstAndLastHeights = {};
	this.__raycaster = new THREE.Raycaster();
	// this.__raycaster.precision = 0.1;
	this.__startPoint = new THREE.Vector3(0, -99999, 0);
	this.__up = new THREE.Vector3(0, 1, 0);
}

SkVoxelizer.prototype.updateIntersections = function()
{
	//cast rays from bottom up and keep list of first and last intersections
	//based on ray stabbing method from "Simplification and Repair of Polygonal Models Using Volumetric Techniques", F. S. Nooruddin and G. Turk

	//NOTE: this assumes that the mesh is well-defined (water-tight, no self-intersections etc),
	//so I'm not doing multiple projections as suggested in the paper to handle difficult cases yet.
	//I just need this to work a sphere for now.

	var min = this.bbox.min;
	var max = this.bbox.max;

	//make sure that the material is double sided
	this.mesh.material.side = THREE.DoubleSide;

	//calculate min and max location of points that are within bounding box
	var xMinMultiple = Math.ceil(min.x / this.voxelSizeX) * this.voxelSizeX;
	var xMaxMultiple = Math.floor(max.x / this.voxelSizeX) * this.voxelSizeX;
	var zMinMultiple = Math.ceil(min.z / this.voxelSizeZ) * this.voxelSizeZ;
	var zMaxMultiple = Math.floor(max.z / this.voxelSizeZ) * this.voxelSizeZ;

	//cast ray upwards from each (x,z) point and detect intersection with mesh
	var x, z;
	var intersectInfo;
	for (x = xMinMultiple; x <= xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		this.intersectionFirstAndLastHeights[x] = {};
		for (z = zMinMultiple; z <= zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			//get first and last intersection points
			this.__startPoint.x = x;
			this.__startPoint.z = z;
			this.__raycaster.set(this.__startPoint, this.__up);
			intersectInfo = this.__raycaster.intersectObject(this.mesh);
			if (intersectInfo && intersectInfo.length >= 2)
			{
				this.intersectionFirstAndLastHeights[x][z] = [];
				this.intersectionFirstAndLastHeights[x][z].push(intersectInfo[0].point.y);
				this.intersectionFirstAndLastHeights[x][z].push(intersectInfo[intersectInfo.length-1].point.y);
			}
		}
	}
}

SkVoxelizer.prototype.voxelize = function()
{
	//calculate the intersection points first
	this.updateIntersections();

	var min = this.bbox.min;
	var max = this.bbox.max;

	//calculate min and max location of points that are within bounding box
	var xMinMultiple = Math.ceil(min.x / this.voxelSizeX) * this.voxelSizeX;
	var xMaxMultiple = Math.floor(max.x / this.voxelSizeX) * this.voxelSizeX;
	var yMinMultiple = Math.ceil(min.y / this.voxelSizeY) * this.voxelSizeY;
	var yMaxMultiple = Math.floor(max.y / this.voxelSizeY) * this.voxelSizeY;
	var zMinMultiple = Math.ceil(min.z / this.voxelSizeZ) * this.voxelSizeZ;
	var zMaxMultiple = Math.floor(max.z / this.voxelSizeZ) * this.voxelSizeZ;

	//TODO: this needs to take into account mesh's world transformation
	var x, y, z;
	for (x = xMinMultiple; x <= xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		this.voxelData[x] = {};
		for (z = zMinMultiple; z <= zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			this.voxelData[x][z] = {};
			for (y = yMinMultiple; y <= yMaxMultiple + this.__EPSILON; y += this.voxelSizeY)
			{
				//check y against the intersection boundaries for this (x,z) value
				if (this.intersectionFirstAndLastHeights[x][z])
				{
					if (y <= this.intersectionFirstAndLastHeights[x][z][0] || y >= this.intersectionFirstAndLastHeights[x][z][1])
					{
						this.voxelData[x][z][y] = 0;
					}
					else
					{
						this.voxelData[x][z][y] = 1;
					}
				}
			}
		}
	}
}

SkVoxelizer.prototype.visualize = function(scene)
{
	var min = this.bbox.min;
	var max = this.bbox.max;

	//calculate min and max location of points that are within bounding box
	var xMinMultiple = Math.ceil(min.x / this.voxelSizeX) * this.voxelSizeX;
	var xMaxMultiple = Math.floor(max.x / this.voxelSizeX) * this.voxelSizeX;
	var yMinMultiple = Math.ceil(min.y / this.voxelSizeY) * this.voxelSizeY;
	var yMaxMultiple = Math.floor(max.y / this.voxelSizeY) * this.voxelSizeY;
	var zMinMultiple = Math.ceil(min.z / this.voxelSizeZ) * this.voxelSizeZ;
	var zMaxMultiple = Math.floor(max.z / this.voxelSizeZ) * this.voxelSizeZ;

	//TODO: this needs to take into account mesh's world transformation
	//create the voxel meshes if they don't already exist
	if (!this.voxelMeshes)
	{
		var voxelGeom = new THREE.CubeGeometry(this.voxelSizeX, this.voxelSizeY, this.voxelSizeZ);
		var voxelMaterial = new THREE.MeshPhongMaterial();

		var x, y, z, thisVoxelMesh;
		this.voxelMeshes = {};
		for (x = xMinMultiple; x <= xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
		{
			this.voxelMeshes[x] = {};
			for (z = zMinMultiple; z <= zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
			{
				this.voxelMeshes[x][z] = {};
				for (y = yMinMultiple; y <= yMaxMultiple + this.__EPSILON; y += this.voxelSizeY)
				{
					thisVoxelMesh = new THREE.Mesh(voxelGeom, voxelMaterial);
					this.voxelMeshes[x][z][y] = thisVoxelMesh;
					thisVoxelMesh.position.x = x;
					thisVoxelMesh.position.y = y;
					thisVoxelMesh.position.z = z;
					scene.add(thisVoxelMesh);
				}
			}
		}	
	}

	//show voxel mesh if voxel data has value of 1
	var x, y, z;
	for (x = xMinMultiple; x <= xMaxMultiple + this.__EPSILON; x += this.voxelSizeX)
	{
		for (z = zMinMultiple; z <= zMaxMultiple + this.__EPSILON; z += this.voxelSizeZ)
		{
			for (y = yMinMultiple; y <= yMaxMultiple + this.__EPSILON; y += this.voxelSizeY)
			{
				this.voxelMeshes[x][z][y].visible = this.voxelData[x][z][y] === 1;
			}
		}
	}	
}