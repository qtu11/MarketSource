"use client"

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Stars } from '@react-three/drei'
import * as THREE from 'three'

function Meteors({ count = 50 }) {
    const mesh = useRef<THREE.InstancedMesh>(null)
    const dummy = useMemo(() => new THREE.Object3D(), [])

    // Khởi tạo data cho mỗi sao băng
    const meteors = useMemo(() => {
        return new Array(count).fill(0).map(() => ({
            x: (Math.random() - 0.5) * 100,
            y: Math.random() * 50 + 20, // Start high
            z: (Math.random() - 0.5) * 100,
            speed: Math.random() * 0.15 + 0.05, // Chậm hơn (0.05 - 0.2)
            length: Math.random() * 2 + 1,
            thickness: Math.random() * 0.05 + 0.02,
        }))
    }, [count])

    // Color gradient cho sao băng (Hồng tới Tím)
    const colorArray = useMemo(() => {
        const colors = new Float32Array(count * 3)
        const color = new THREE.Color()
        for (let i = 0; i < count; i++) {
            // Chọn ngẫu nhiên giữa màu tím, hồng, xanh đậm
            const hue = Math.random() > 0.5 ? 0.8 : 0.9;
            color.setHSL(hue, 1.0, 0.7)
            colors[i * 3] = color.r
            colors[i * 3 + 1] = color.g
            colors[i * 3 + 2] = color.b
        }
        return colors
    }, [count])

    useFrame(() => {
        if (!mesh.current) return

        meteors.forEach((meteor, i) => {
            // Di chuyển sao băng chéo xuống (tốc độ chậm)
            meteor.x -= meteor.speed * 0.8
            meteor.y -= meteor.speed * 1.6
            meteor.z -= meteor.speed * 0.8

            // Nếu rớt khỏi màn hình thì reset lên trên
            if (meteor.y < -30) {
                meteor.x = (Math.random() - 0.5) * 100 + 50 // Shift right to counter movement
                meteor.y = Math.random() * 50 + 50
                meteor.z = (Math.random() - 0.5) * 100
            }

            dummy.position.set(meteor.x, meteor.y, meteor.z)
            // Xoay cylinder để nó hướng theo chiều di chuyển
            dummy.rotation.set(-Math.PI / 4, 0, Math.PI / 4)
            dummy.scale.set(meteor.thickness, meteor.length, meteor.thickness)
            dummy.updateMatrix()
            mesh.current!.setMatrixAt(i, dummy.matrix)
        })
        mesh.current.instanceMatrix.needsUpdate = true
    })

    // Geometry: Dùng Cylinder để tạo đường vệt (trail)
    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, count]}>
            <cylinderGeometry args={[1, 0, 1, 8]} />
            <meshBasicMaterial blending={THREE.AdditiveBlending} transparent opacity={0.8} />
            <instancedBufferAttribute attach="instanceColor" array={colorArray} itemSize={3} />
        </instancedMesh>
    )
}

export function MeteorShower3D() {
    return (
        <div className="absolute inset-0 pointer-events-none z-0 bg-[#0B0C10]">
            <Canvas camera={{ position: [0, 0, 20], fov: 60 }} gl={{ alpha: true, antialias: false }}>
                {/* Bầu trời sao động chân thực */}
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                {/* Các cơn mưa sao băng */}
                <Meteors count={60} />
            </Canvas>
            {/* Lớp mờ rực rỡ bên dưới để mix với site */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-900/10 to-[#0B0C10]" />
        </div>
    )
}
