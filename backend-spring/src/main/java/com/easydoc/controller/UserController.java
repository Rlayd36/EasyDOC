package com.easydoc.controller;

import com.easydoc.entity.User;
import com.easydoc.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;




@RestController
@CrossOrigin(origins="http://localhost:5173")
@RequestMapping("/api/users")
public class UserController {
    @Autowired
    private UserRepository userRepository;

    /*회원가입*/
    @PostMapping("/signup")
    public ResponseEntity<?> signup(@RequestBody User user){
        if(userRepository.findByEmail(user.getEmail()).isPresent()){
            return ResponseEntity.badRequest().body("이미 존재하는 이메일입니다.");
        }
        userRepository.save(user);
        return ResponseEntity.ok("회원가입 성공!");
    }
    
    /*로그인(추후 비밀번호 암호화 예정)*/
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> loginData){
        String email=loginData.get("email");
        String password=loginData.get("password");

        User user=userRepository.findByEmail(email).orElse(null);

        if(user==null||!user.getPassword().equals(password)){
            return ResponseEntity.status(401).body("이메일 또는 비밀번호가 잘못되었습니다.");
        }
        return ResponseEntity.ok("로그인 성공");
    }

    /*비밀번호 변경*/
    @PutMapping("/password")
    public ResponseEntity<?> updatePassword(@RequestBody Map<String, String> data){
        String email=data.get("email");
        String currentPassword=data.get("currentPassword");
        String newPassword=data.get("newPassword");

        User user=userRepository.findByEmail(email).orElse(null); 

        if(user==null||!user.getPassword().equals(currentPassword)){
            return ResponseEntity.status(401).body("현재 비밀번호가 일치하지 않습니다.");
        }

        user.setPassword(newPassword);
        userRepository.save(user);
        return ResponseEntity.ok("비밀번호가 변경되었습니다!");
    }

    /*계정 삭제*/
    @DeleteMapping("/{email}")
    public ResponseEntity<?> deleteUser(@PathVariable String email){
        User user=userRepository.findByEmail(email).orElse(null);

        if(user==null){
            return ResponseEntity.status(404).body("사용자를 찾을 수 없습니다.");
        }
        userRepository.delete(user);
        return ResponseEntity.ok("계정이 삭제되었습니다!");
    }
}



